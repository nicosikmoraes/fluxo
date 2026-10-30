<?php

namespace Tests\Feature;

use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class CopyWorkspaceImagesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['filesystems.disks.cloud-private' => ['driver' => 'local']]);
        Storage::fake('local');
        Storage::fake('public');
        Storage::fake('cloud-private');
    }

    public function test_copies_owned_and_legacy_images_without_deleting_sources_or_overwriting_identical_files(): void
    {
        Storage::disk('local')->put('images/42/owned.png', 'owned image');
        Storage::disk('public')->put('images/legacy.jpg', 'legacy image');
        Storage::disk('public')->put('images/ignored.svg', 'not an allowed cover');

        $this->artisan('workspace:copy-images', ['--to' => 'cloud-private'])->assertSuccessful();
        $this->assertSame('owned image', Storage::disk('cloud-private')->get('images/42/owned.png'));
        $this->assertSame('legacy image', Storage::disk('cloud-private')->get('images/legacy.jpg'));
        Storage::disk('cloud-private')->assertMissing('images/ignored.svg');
        Storage::disk('local')->assertExists('images/42/owned.png');
        Storage::disk('public')->assertExists('images/legacy.jpg');
        $this->artisan('workspace:copy-images', ['--to' => 'cloud-private'])->expectsOutputToContain('Já existentes e verificadas: 2')->assertSuccessful();
    }

    public function test_dry_run_lists_images_without_writing_to_the_destination(): void
    {
        Storage::disk('local')->put('images/42/owned.png', 'private image');

        $this->artisan('workspace:copy-images', ['--to' => 'cloud-private', '--dry-run' => true])
            ->expectsOutputToContain('local:images/42/owned.png -> cloud-private:images/42/owned.png')->assertSuccessful();
        Storage::disk('cloud-private')->assertMissing('images/42/owned.png');
        Storage::disk('local')->assertExists('images/42/owned.png');
    }

    public function test_different_existing_content_causes_failure_without_overwriting_or_deleting_either_file(): void
    {
        Storage::disk('local')->put('images/42/owned.png', 'original');
        Storage::disk('cloud-private')->put('images/42/owned.png', 'different');

        $this->artisan('workspace:copy-images', ['--to' => 'cloud-private'])->expectsOutputToContain('Nenhum arquivo foi sobrescrito')->assertFailed();
        $this->assertSame('original', Storage::disk('local')->get('images/42/owned.png'));
        $this->assertSame('different', Storage::disk('cloud-private')->get('images/42/owned.png'));
    }

    public function test_missing_unknown_or_source_disks_are_rejected_before_copying(): void
    {
        Storage::disk('local')->put('images/42/owned.png', 'original');

        $this->artisan('workspace:copy-images')->assertFailed();
        $this->artisan('workspace:copy-images', ['--to' => 'unknown'])->assertFailed();
        $this->artisan('workspace:copy-images', ['--to' => 'local'])->assertFailed();
        $this->artisan('workspace:copy-images', ['--to' => 'public'])->assertFailed();
        Storage::disk('local')->assertExists('images/42/owned.png');
        $this->assertSame([], Storage::disk('cloud-private')->allFiles());
    }

    public function test_failed_destination_write_preserves_the_original_and_returns_failure(): void
    {
        Storage::disk('local')->put('images/42/owned.png', 'original');
        $destination = Mockery::mock(FilesystemAdapter::class);
        $destination->shouldReceive('exists')->once()->with('images/42/owned.png')->andReturn(false);
        $destination->shouldReceive('put')->once()->andReturn(false);
        Storage::set('cloud-private', $destination);

        $this->artisan('workspace:copy-images', ['--to' => 'cloud-private'])->expectsOutputToContain('Não foi possível copiar')->assertFailed();
        $this->assertSame('original', Storage::disk('local')->get('images/42/owned.png'));
    }

    public function test_copy_refuses_staging_where_the_local_sources_are_not_available(): void
    {
        Storage::disk('local')->put('images/42/owned.png', 'original');
        $this->app['env'] = 'staging';

        $this->artisan('workspace:copy-images', ['--to' => 'cloud-private'])->assertFailed();
        Storage::disk('local')->assertExists('images/42/owned.png');
        $this->assertSame([], Storage::disk('cloud-private')->allFiles());
    }
}
