<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Whiteboard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WhiteboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $boards = $request->user()->whiteboards()->orderBy('id')->get(['id', 'name'])->map(fn (Whiteboard $board): array => [
            'id' => (string) $board->id,
            'name' => $board->name,
            'is_global' => false,
        ]);

        return response()->json(['whiteboards' => collect([
            ['id' => 'global', 'name' => __('Quadro global'), 'is_global' => true],
        ])->concat($boards)->values()]);
    }

    public function storeBoard(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:50']]);
        $board = $request->user()->whiteboards()->create([
            'name' => $data['name'],
            'elements' => [],
            'version' => 0,
        ]);

        return response()->json([
            'id' => (string) $board->id,
            'name' => $board->name,
            'is_global' => false,
        ], 201);
    }

    public function renameBoard(Request $request, string $whiteboard): JsonResponse
    {
        $board = $request->user()->whiteboards()->findOrFail($whiteboard);
        $data = $request->validate(['name' => ['required', 'string', 'max:50']]);
        $board->update(['name' => $data['name']]);

        return response()->json([
            'id' => (string) $board->id,
            'name' => $board->name,
            'is_global' => false,
        ]);
    }

    public function destroyBoard(Request $request, string $whiteboard): JsonResponse
    {
        $request->user()->whiteboards()->findOrFail($whiteboard)->delete();

        return response()->json([], 204);
    }

    public function showNamed(Request $request, string $whiteboard): JsonResponse
    {
        $board = $request->user()->whiteboards()->findOrFail($whiteboard);

        return response()->json(['elements' => $board->elements ?? [], 'version' => $board->version]);
    }

    public function updateNamed(Request $request, string $whiteboard): JsonResponse
    {
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:0'],
            'elements' => ['present', 'array', 'list', 'max:1500'],
        ]);
        $elements = $this->validateElements($data['elements']);

        $board = DB::transaction(function () use ($request, $whiteboard, $data, $elements): Whiteboard {
            $board = $request->user()->whiteboards()->whereKey($whiteboard)->lockForUpdate()->firstOrFail();
            abort_if($board->version !== (int) $data['version'], 409, __('O quadro mudou em outra aba. Exporte seu rascunho antes de carregar a versão salva.'));
            $board->forceFill(['elements' => $elements, 'version' => $board->version + 1])->save();

            return $board;
        }, 5);

        return response()->json(['version' => $board->version]);
    }

    public function show(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();

        return response()->json(['elements' => $user->whiteboard ?? [], 'version' => $user->whiteboard_version]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:0'],
            'elements' => ['present', 'array', 'list', 'max:1500'],
        ]);

        $elements = $this->validateElements($data['elements']);

        $user = DB::transaction(function () use ($request, $data, $elements): User {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            abort_if($user->whiteboard_version !== (int) $data['version'], 409, __('O quadro mudou em outra aba. Exporte seu rascunho antes de carregar a versão salva.'));
            $user->forceFill(['whiteboard' => $elements, 'whiteboard_version' => $user->whiteboard_version + 1])->save();

            return $user;
        }, 5);

        return response()->json(['version' => $user->whiteboard_version]);
    }

    /** @param array<int, mixed> $input */
    private function validateElements(array $input): array
    {
        if (strlen(json_encode($input, JSON_THROW_ON_ERROR)) > 2000000) {
            throw ValidationException::withMessages(['elements' => __('O quadro ficou muito grande. Reduza os desenhos antes de salvar.')]);
        }

        $elements = [];
        $ids = [];
        $pointCount = 0;
        foreach ($input as $element) {
            $validated = Validator::make(['element' => $element], [
                'element' => ['required', 'array:id,type,x,y,width,height,stroke,fill,strokeWidth,fontSize,text,points,groupId'],
                'element.id' => ['required', 'string', 'max:80', 'regex:/^[a-zA-Z0-9_-]+$/'],
                'element.type' => ['required', Rule::in(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'pen', 'text', 'note'])],
                'element.x' => ['required', 'numeric', 'between:-1000000,1000000'],
                'element.y' => ['required', 'numeric', 'between:-1000000,1000000'],
                'element.width' => ['required', 'numeric', 'between:0,100000'],
                'element.height' => ['required', 'numeric', 'between:0,100000'],
                'element.stroke' => ['required', 'string', 'regex:/^#[a-fA-F0-9]{6}$/'],
                'element.fill' => ['required', 'string', 'regex:/^(transparent|#[a-fA-F0-9]{6})$/'],
                'element.strokeWidth' => ['required', 'integer', 'between:1,8'],
                'element.fontSize' => ['required', 'integer', 'between:12,64'],
                'element.text' => ['present', 'nullable', 'string', 'max:4000'],
                'element.groupId' => ['present', 'nullable', 'string', 'max:80', 'regex:/^[a-zA-Z0-9_-]+$/'],
                'element.points' => ['present', 'array', 'list', 'max:2000'],
            ])->validate()['element'];

            if (isset($ids[$validated['id']])) {
                throw ValidationException::withMessages(['elements' => __('Cada elemento do quadro precisa ter um identificador único.')]);
            }
            $ids[$validated['id']] = true;
            $pointCount += count($validated['points']);
            if ($pointCount > 50000) {
                throw ValidationException::withMessages(['elements' => __('Há muitos traços no quadro. Simplifique alguns desenhos antes de salvar.')]);
            }
            if (in_array($validated['type'], ['line', 'arrow', 'pen']) && count($validated['points']) < 2) {
                throw ValidationException::withMessages(['elements' => __('Uma linha ou desenho precisa ter pelo menos dois pontos.')]);
            }
            if (in_array($validated['type'], ['line', 'arrow']) && count($validated['points']) !== 2) {
                throw ValidationException::withMessages(['elements' => __('Uma linha ou seta precisa ter exatamente dois pontos.')]);
            }
            foreach ($validated['points'] as $point) {
                if (! is_array($point) || ! array_is_list($point) || count($point) !== 2) {
                    throw ValidationException::withMessages(['elements' => __('Confira os pontos do desenho.')]);
                }
                foreach ($point as $coordinate) {
                    if (! is_numeric($coordinate) || ! is_finite((float) $coordinate) || abs((float) $coordinate) > 100000) {
                        throw ValidationException::withMessages(['elements' => __('Confira as coordenadas do desenho.')]);
                    }
                }
            }
            $validated['text'] ??= '';
            $elements[] = $validated;
        }

        return $elements;
    }
}
