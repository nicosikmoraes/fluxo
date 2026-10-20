<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Whiteboard;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class WhiteboardTest extends TestCase
{
    use RefreshDatabase;

    public function createApplication(): Application
    {
        $app = parent::createApplication();
        if ($app['config']->get('database.default') !== 'sqlite' || $app['config']->get('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Estes testes só podem usar SQLite em memória.');
        }

        return $app;
    }

    private function element(array $attributes = []): array
    {
        return array_replace([
            'id' => 'ideia-1', 'type' => 'note', 'x' => -30, 'y' => 80, 'width' => 216, 'height' => 180,
            'stroke' => '#454157', 'fill' => '#fff1b8', 'strokeWidth' => 2, 'fontSize' => 20,
            'text' => "Primeira ideia\nPróximo passo", 'points' => [], 'groupId' => null,
        ], $attributes);
    }

    public function test_reopens_the_saved_document_and_preserves_all_element_types(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $elements = [];
        foreach (['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'pen', 'text', 'note'] as $index => $type) {
            $elements[] = $this->element(['id' => 'element-'.$index, 'type' => $type, 'points' => in_array($type, ['line', 'arrow', 'pen']) ? [[0, 0], [216, 180]] : [], 'groupId' => 'grupo-1']);
        }

        $this->putJson('/api/whiteboard', ['elements' => $elements, 'version' => 0])->assertOk()->assertJsonPath('version', 1);

        $this->assertSame($elements, $user->fresh()->whiteboard);
        $this->getJson('/api/whiteboard')->assertOk()->assertExactJson(['elements' => $elements, 'version' => 1]);
        $this->putJson('/api/whiteboard', ['elements' => [], 'version' => 1])->assertOk()->assertJsonPath('version', 2);
        $this->assertSame([], $user->fresh()->whiteboard);
    }

    public function test_a_new_account_has_an_empty_board_and_never_reads_or_changes_another_account(): void
    {
        $owner = User::factory()->create();
        $this->actingAs($owner)->putJson('/api/whiteboard', ['elements' => [$this->element()], 'version' => 0])->assertOk();
        $other = User::factory()->create();
        $this->actingAs($other);

        $this->getJson('/api/whiteboard?user_id='.$owner->id)->assertOk()->assertExactJson(['elements' => [], 'version' => 0]);
        $this->putJson('/api/whiteboard', ['elements' => [], 'version' => 0, 'user_id' => $owner->id])->assertOk();

        $this->assertSame([$this->element()], $owner->fresh()->whiteboard);
        $this->assertSame([], $other->fresh()->whiteboard);
        $this->assertArrayNotHasKey('whiteboard', $owner->fresh()->toArray());
        $this->assertArrayNotHasKey('whiteboard_version', $owner->fresh()->toArray());
    }

    public function test_requires_authentication_to_read_and_save(): void
    {
        $this->getJson('/api/whiteboard')->assertUnauthorized();
        $this->putJson('/api/whiteboard', ['elements' => [], 'version' => 0])->assertUnauthorized();
    }

    public function test_refuses_a_stale_save_with_409_without_overwriting_the_newer_board(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->putJson('/api/whiteboard', ['elements' => [$this->element()], 'version' => 0])->assertOk();

        $this->putJson('/api/whiteboard', ['elements' => [], 'version' => 0])->assertConflict()->assertJsonPath('message', 'O quadro mudou em outra aba. Exporte seu rascunho antes de carregar a versão salva.');

        $this->assertSame([$this->element()], $user->fresh()->whiteboard);
        $this->assertSame(1, $user->fresh()->whiteboard_version);
    }

    public function test_named_boards_keep_independent_contents_and_preserve_the_global_board(): void
    {
        $user = User::factory()->create(['whiteboard' => [$this->element()]]);
        $this->actingAs($user);

        $created = $this->postJson('/api/whiteboards', ['name' => 'Ideias do produto'])->assertCreated();
        $id = $created->json('id');
        $elements = [$this->element(['id' => 'ideia-nomeada', 'text' => 'Próximo lançamento'])];

        $this->assertDatabaseHas('whiteboards', ['id' => $id, 'user_id' => $user->id, 'name' => 'Ideias do produto']);
        $this->putJson('/api/whiteboards/'.$id.'/content', ['elements' => $elements, 'version' => 0])->assertOk()->assertJsonPath('version', 1);
        $this->getJson('/api/whiteboards/'.$id.'/content')->assertOk()->assertExactJson(['elements' => $elements, 'version' => 1]);
        $this->patchJson('/api/whiteboards/'.$id, ['name' => 'Próximo lançamento'])->assertOk()->assertJsonPath('name', 'Próximo lançamento');
        $this->getJson('/api/whiteboards')->assertOk()->assertExactJson(['whiteboards' => [
            ['id' => 'global', 'name' => 'Quadro global', 'is_global' => true],
            ['id' => $id, 'name' => 'Próximo lançamento', 'is_global' => false],
        ]]);
        $this->deleteJson('/api/whiteboards/'.$id)->assertNoContent();

        $this->assertDatabaseMissing('whiteboards', ['id' => $id]);
        $this->assertSame([$this->element()], $user->fresh()->whiteboard);
    }

    public static function namedBoardActions(): array
    {
        return [
            'ler conteúdo' => ['GET', '/content', []],
            'salvar conteúdo' => ['PUT', '/content', ['elements' => [], 'version' => 0]],
            'renomear' => ['PATCH', '', ['name' => 'Outro nome']],
            'excluir' => ['DELETE', '', []],
        ];
    }

    #[DataProvider('namedBoardActions')]
    public function test_returns_404_for_named_boards_owned_by_another_account(string $method, string $suffix, array $payload): void
    {
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->for($owner)->create(['elements' => [$this->element()], 'version' => 0]);
        $other = User::factory()->create();

        $this->actingAs($other)->json($method, '/api/whiteboards/'.$board->id.$suffix, $payload)->assertNotFound();

        $this->assertModelExists($board);
        $this->assertSame([$this->element()], $board->fresh()->elements);
        $this->assertSame(0, $board->fresh()->version);
        $this->assertSame([], $other->whiteboards()->get()->all());
    }

    public function test_returns_409_for_a_stale_named_board_save_without_replacing_its_content(): void
    {
        $user = User::factory()->create();
        $board = Whiteboard::factory()->for($user)->create(['elements' => [$this->element()], 'version' => 1]);

        $this->actingAs($user)->putJson('/api/whiteboards/'.$board->id.'/content', ['elements' => [], 'version' => 0])
            ->assertConflict()->assertJsonPath('message', 'O quadro mudou em outra aba. Exporte seu rascunho antes de carregar a versão salva.');

        $this->assertSame([$this->element()], $board->fresh()->elements);
        $this->assertSame(1, $board->fresh()->version);
    }

    public static function invalidElements(): array
    {
        return [
            'tipo desconhecido' => [['type' => 'script']],
            'identificador inseguro' => [['id' => '<svg>']],
            'coordenada fora da área' => [['x' => 1000001]],
            'tamanho negativo' => [['height' => -5]],
            'cor não permitida' => [['stroke' => 'url(https://example.com)']],
            'preenchimento não permitido' => [['fill' => 'red']],
            'texto grande' => [['text' => str_repeat('a', 4001)]],
            'chave inesperada' => [['user_id' => 999]],
            'ponto malformado' => [['points' => [[1, 2, 3]]]],
            'ponto fora da área' => [['points' => [[0, 100001]]]],
            'linha sem pontos' => [['type' => 'line']],
            'seta com apenas um ponto' => [['type' => 'arrow', 'points' => [[0, 0]]]],
            'linha com pontos extras' => [['type' => 'line', 'points' => [[0, 0], [10, 10], [20, 20]]]],
            'pontos demais por desenho' => [['type' => 'pen', 'points' => array_fill(0, 2001, [0, 0])]],
        ];
    }

    #[DataProvider('invalidElements')]
    public function test_refuses_invalid_elements_with_422_and_preserves_the_document(array $attributes): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->putJson('/api/whiteboard', ['elements' => [$this->element($attributes)], 'version' => 0])->assertUnprocessable()->assertJsonStructure(['message', 'errors']);

        $this->assertNull($user->fresh()->whiteboard);
        $this->assertSame(0, $user->fresh()->whiteboard_version);
    }

    public function test_rejects_duplicate_ids_and_excessive_document_size_without_partial_writes(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->putJson('/api/whiteboard', ['elements' => [$this->element(), $this->element()], 'version' => 0])->assertUnprocessable()->assertJsonValidationErrors('elements');
        $this->putJson('/api/whiteboard', ['elements' => array_fill(0, 1501, $this->element()), 'version' => 0])->assertUnprocessable()->assertJsonValidationErrors('elements');
        $this->putJson('/api/whiteboard', ['elements' => [$this->element(['text' => str_repeat('a', 2000001)])], 'version' => 0])->assertUnprocessable()->assertJsonValidationErrors('elements');
        $this->putJson('/api/whiteboard', [])->assertUnprocessable()->assertJsonValidationErrors(['elements', 'version']);

        $this->assertNull($user->fresh()->whiteboard);
        $this->assertSame(0, $user->fresh()->whiteboard_version);
    }

    public function test_rejects_excessive_total_points_with_422_without_partial_writes(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $elements = [];
        for ($index = 0; $index < 26; $index++) {
            $elements[] = $this->element(['id' => 'stroke-'.$index, 'type' => 'pen', 'points' => array_fill(0, 2000, [0, 0])]);
        }

        $this->putJson('/api/whiteboard', ['version' => 0, 'elements' => $elements])->assertUnprocessable()->assertJsonPath('errors.elements.0', 'Há muitos traços no quadro. Simplifique alguns desenhos antes de salvar.');

        $this->assertNull($user->fresh()->whiteboard);
        $this->assertSame(0, $user->fresh()->whiteboard_version);
    }
}
