<?php

namespace Tests\Feature;

use App\Models\User;
use Aws\MockHandler;
use Aws\Result;
use GuzzleHttp\Psr7\Utils;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class PersistentImageStorageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('cloud-private');
        Storage::fake('local');
        Storage::fake('public');
        config(['filesystems.default' => 'cloud-private']);
    }

    private function png(): string
    {
        return base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYhQAAAAASUVORK5CYII=');
    }

    public function test_upload_read_and_delete_use_the_default_private_disk(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $path = $this->postJson('/api/images', ['image' => UploadedFile::fake()->createWithContent('cover.png', $this->png())])
            ->assertCreated()->json('path');

        $this->assertStringStartsWith('/storage/images/'.$user->id.'/', $path);
        Storage::disk('cloud-private')->assertExists(substr($path, 9));
        Storage::disk('local')->assertMissing(substr($path, 9));
        $this->getJson($path)->assertOk()->assertHeader('Content-Type', 'image/png')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeaderContains('Cache-Control', 'private')->assertHeaderContains('Cache-Control', 'no-store')
            ->assertStreamedContent($this->png());
        $task = $this->postJson('/api/tasks', ['title' => 'Capa persistente', 'cover_path' => $path])->assertCreated()->json('id');
        $this->assertDatabaseHas('tasks', ['id' => $task, 'cover_path' => $path, 'user_id' => $user->id]);
        $this->deleteJson('/api/tasks/'.$task)->assertNoContent();
        Storage::disk('cloud-private')->assertMissing(substr($path, 9));
        $this->assertDatabaseMissing('tasks', ['id' => $task]);
    }

    public function test_another_account_cannot_read_or_attach_a_cloud_image_and_receives_404_or_422(): void
    {
        $owner = User::factory()->create();
        Storage::disk()->put('images/'.$owner->id.'/private.png', $this->png());
        $this->actingAs(User::factory()->create());

        $this->getJson('/storage/images/'.$owner->id.'/private.png')->assertNotFound();
        $this->postJson('/api/tasks', ['title' => 'Imagem alheia', 'cover_path' => '/storage/images/'.$owner->id.'/private.png'])
            ->assertUnprocessable()->assertJsonValidationErrors('cover_path');
        Storage::disk()->assertExists('images/'.$owner->id.'/private.png');
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_anonymous_cloud_image_requests_and_uploads_return_401(): void
    {
        Storage::disk()->put('images/1/private.png', $this->png());

        $this->getJson('/storage/images/1/private.png')->assertUnauthorized();
        $this->postJson('/api/images', ['image' => UploadedFile::fake()->createWithContent('cover.png', $this->png())])->assertUnauthorized();
        $this->assertSame(['images/1/private.png'], Storage::disk()->allFiles());
    }

    public function test_missing_cloud_image_returns_404_for_its_owner(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/storage/images/'.$user->id.'/missing.png')->assertNotFound();
    }

    public function test_legacy_images_copied_to_the_private_disk_keep_their_url_and_ownership(): void
    {
        $owner = User::factory()->create();
        $this->actingAs($owner);
        $project = $this->postJson('/api/projects', ['title' => 'Legado', 'cover' => 'desk'])->assertCreated()->json('id');
        DB::table('projects')->where('id', $project)->update(['cover_path' => '/storage/images/legacy.png']);
        Storage::disk()->put('images/legacy.png', $this->png());

        $this->getJson('/storage/images/legacy.png')->assertOk()->assertStreamedContent($this->png());
        $this->flushSession();
        $this->actingAs(User::factory()->create())->getJson('/storage/images/legacy.png')->assertNotFound();
        $this->flushSession();
        $this->actingAs($owner)->deleteJson('/api/projects/'.$project, ['delete_tasks' => false])->assertNoContent();
        Storage::disk()->assertMissing('images/legacy.png');
    }

    public function test_failed_storage_write_returns_503_instead_of_a_broken_image_url(): void
    {
        $this->actingAs(User::factory()->create(['locale' => 'en-US']));
        $disk = Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('putFileAs')->once()->andReturn(false);
        Storage::shouldReceive('disk')->with(null)->once()->andReturn($disk);

        $this->postJson('/api/images', ['image' => UploadedFile::fake()->createWithContent('cover.png', $this->png())])
            ->assertStatus(503)->assertJsonPath('message', 'The image could not be saved. Please try again.')->assertJsonMissingPath('path');
    }

    public function test_invalid_and_oversized_images_return_422_without_writing_files(): void
    {
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/images', ['image' => UploadedFile::fake()->createWithContent('unsafe.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>')])
            ->assertUnprocessable()->assertJsonValidationErrors('image');
        $this->postJson('/api/images', ['image' => UploadedFile::fake()->createWithContent('large.png', $this->png())->size(8193)])
            ->assertUnprocessable()->assertJsonValidationErrors('image');
        $this->assertSame([], Storage::disk()->allFiles());
    }

    public function test_real_s3_adapter_streams_authenticated_images_without_local_paths(): void
    {
        config(['filesystems.default' => 's3', 'filesystems.disks.s3' => [
            'driver' => 's3', 'key' => 'test-key', 'secret' => 'test-secret', 'region' => 'auto',
            'bucket' => 'fluxo-test', 'endpoint' => 'https://test.r2.cloudflarestorage.com', 'throw' => true,
        ]]);
        $commands = [];
        $handler = new MockHandler([
            new Result,
            new Result,
            new Result(['ContentType' => 'image/png']),
            new Result(['ContentLength' => strlen($this->png())]),
            new Result(['Body' => Utils::streamFor($this->png())]),
            new Result,
        ]);
        Storage::disk()->getClient()->getHandlerList()->setHandler(function ($command, $request) use ($handler, &$commands) {
            $commands[] = [$command->getName(), $command['Bucket'], $command['Key']];

            return $handler($command, $request);
        });
        $user = User::factory()->create();
        $this->actingAs($user);

        $path = $this->postJson('/api/images', ['image' => UploadedFile::fake()->createWithContent('cover.png', $this->png())])->assertCreated()->json('path');
        $this->getJson($path)->assertOk()->assertStreamedContent($this->png());
        $task = $this->postJson('/api/tasks', ['title' => 'S3', 'cover_path' => $path])->assertCreated()->json('id');
        $this->deleteJson('/api/tasks/'.$task)->assertNoContent();
        $this->assertSame(['PutObject', 'HeadObject', 'HeadObject', 'HeadObject', 'GetObject', 'DeleteObject'], array_column($commands, 0));
        foreach ($commands as [, $bucket, $key]) {
            $this->assertSame('fluxo-test', $bucket);
            $this->assertSame(substr($path, 9), $key);
        }
        $this->assertCount(0, $handler);
    }
}
