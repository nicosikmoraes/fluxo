<?php

namespace App\Http\Controllers;

use App\Models\AdminSetting;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function session(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user() ? [...$request->user()->only('id', 'name', 'email', 'locale', 'is_admin'), 'billing' => $request->user()->billingAccess()] : null,
            'site' => AdminSetting::publicPreferences(),
            'csrf_token' => $request->session()->token(),
        ])->header('Cache-Control', 'no-store, private');
    }

    private function normalizeEmail(Request $request): void
    {
        $email = $request->input('email');
        if (is_string($email)) {
            $request->merge(['email' => Str::lower(trim($email))]);
        }
    }

    public function register(Request $request): JsonResponse
    {
        $preferences = AdminSetting::preferences();
        abort_if($preferences['maintenance'], 503, __('O Fluxo está em manutenção. Tente novamente em breve.'));
        abort_unless($preferences['newAccounts'], 403, __('Novos cadastros estão temporariamente desativados.'));
        $this->normalizeEmail($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'locale' => ['sometimes', 'string', Rule::in(['pt-BR', 'en-US'])],
            'email' => ['required', 'email', 'max:254', 'unique:users,email'],
            'password' => ['required', 'string', 'confirmed', PasswordRule::min(6), 'max:128'],
        ], [
            'name.required' => __('Informe seu nome.'),
            'email.required' => __('Informe seu e-mail.'),
            'email.email' => __('Informe um e-mail válido.'),
            'email.unique' => __('Já existe uma conta com este e-mail. Entre ou recupere sua senha.'),
            'password.required' => __('Crie uma senha.'),
            'password.min' => __('Use uma senha com pelo menos 6 caracteres.'),
            'password.confirmed' => __('As senhas precisam ser iguais.'),
        ]);
        $data['locale'] ??= app()->getLocale() === 'en' ? 'en-US' : 'pt-BR';
        $user = User::create($data);
        Auth::login($user);
        $request->session()->regenerate();

        return $this->session($request)->setStatusCode(201);
    }

    public function login(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);
        $data = $request->validate([
            'email' => ['required', 'email', 'max:254'],
            'password' => ['required', 'string', 'max:128'],
            'remember' => ['sometimes', 'boolean'],
        ], ['email.required' => __('Informe seu e-mail.'), 'email.email' => __('Informe um e-mail válido.'), 'password.required' => __('Informe sua senha.')]);
        if (! Auth::attempt(['email' => $data['email'], 'password' => $data['password'], 'disabled_at' => null], $data['remember'] ?? false)) {
            throw ValidationException::withMessages(['email' => __('E-mail ou senha incorretos.')]);
        }
        $request->session()->regenerate();

        return $this->session($request);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return $this->session($request);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);
        $data = $request->validate(['email' => ['required', 'email', 'max:254']], ['email.email' => __('Informe um e-mail válido.')]);
        Password::sendResetLink($data);

        return response()->json(['message' => __('Se existir uma conta com este e-mail, você receberá as instruções para redefinir sua senha.')]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $this->normalizeEmail($request);
        $data = $request->validate([
            'email' => ['required', 'email', 'max:254'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'confirmed', PasswordRule::min(6), 'max:128'],
        ], ['password.min' => __('Use uma senha com pelo menos 6 caracteres.'), 'password.confirmed' => __('As senhas precisam ser iguais.')]);
        $status = Password::reset($data, function (User $user, string $password): void {
            $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
            event(new PasswordReset($user));
        });
        if ($status !== Password::PasswordReset) {
            throw ValidationException::withMessages(['email' => __('Este link é inválido ou expirou. Peça um novo link de recuperação.')]);
        }

        return $this->logout($request);
    }
}
