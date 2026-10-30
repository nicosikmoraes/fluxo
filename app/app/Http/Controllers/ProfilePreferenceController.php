<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProfilePreferenceController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'locale' => ['required', 'string', Rule::in(['pt-BR', 'en-US'])],
        ]);

        $user = $request->user();
        $user->forceFill(['locale' => $data['locale']])->save();

        return response()->json(['user' => [...$user->only('id', 'name', 'email', 'locale'), 'billing' => $user->billingAccess()]])
            ->header('Cache-Control', 'no-store, private');
    }
}
