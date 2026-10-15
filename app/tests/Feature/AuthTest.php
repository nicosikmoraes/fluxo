<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_anonymous_session_returns_a_csrf_token_without_workspace_data(): void
    {
        $this->getJson('/api/auth/session')->assertOk()->assertJsonPath('user', null)->assertJsonStructure(['csrf_token']);
        $this->getJson('/api/workspace')->assertUnauthorized();
    }

    public function test_registration_normalizes_email_hashes_password_and_signs_in(): void
    {
        $response = $this->postJson('/api/auth/register', ['name' => 'Nicolas', 'email' => 'NICOLAS@example.com', 'password' => 'uma senha longa 123', 'password_confirmation' => 'uma senha longa 123', 'user_id' => 999]);

        $response->assertCreated()->assertJsonPath('user.name', 'Nicolas')->assertJsonPath('user.email', 'nicolas@example.com')->assertJsonMissingPath('user.password')->assertJsonMissingPath('user.remember_token');
        $user = User::where('email', 'nicolas@example.com')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertTrue(Hash::check('uma senha longa 123', $user->password));
        $this->postJson('/api/tasks', ['title' => 'Minha ideia', 'user_id' => 999])->assertCreated();
        $this->assertDatabaseHas('tasks', ['title' => 'Minha ideia', 'user_id' => $user->id]);
    }

    public function test_registration_rejects_duplicate_email_and_invalid_password_with_422(): void
    {
        User::factory()->create(['email' => 'conta@example.com']);

        $this->postJson('/api/auth/register', ['name' => 'Conta', 'email' => 'CONTA@example.com', 'password' => 'curta', 'password_confirmation' => 'outra'])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
        $this->assertDatabaseCount('users', 1);
        $this->assertGuest();
    }

    public function test_login_with_remember_me_authenticates_and_logout_revokes_access(): void
    {
        $user = User::factory()->create(['password' => 'uma senha longa 123']);

        $this->postJson('/api/auth/login', ['email' => strtoupper($user->email), 'password' => 'uma senha longa 123', 'remember' => true])->assertOk()->assertCookie(auth()->getRecallerName())->assertJsonPath('user.id', $user->id);
        $this->assertAuthenticatedAs($user);
        $this->getJson('/api/workspace')->assertOk();
        $this->postJson('/api/auth/logout')->assertOk()->assertJsonPath('user', null);
        $this->assertGuest();
        $this->getJson('/api/workspace')->assertUnauthorized();
    }

    public function test_bad_credentials_return_a_generic_error_and_attempts_are_limited(): void
    {
        $user = User::factory()->create();
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'senha incorreta'])->assertUnprocessable()->assertJsonPath('errors.email.0', 'E-mail ou senha incorretos.');
        }
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'senha incorreta'])->assertTooManyRequests();
        $this->assertGuest();
    }

    public function test_login_and_workspace_writes_reject_missing_csrf_with_419(): void
    {
        $this->app['env'] = 'local';
        $user = User::factory()->create();

        $this->withSession(['_token' => 'known-token'])->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertStatus(419);
        $this->actingAs($user)->postJson('/api/projects', ['title' => 'Sem token', 'cover' => 'desk'])->assertStatus(419);
        $this->assertDatabaseCount('projects', 0);
        $this->withHeader('X-CSRF-TOKEN', 'known-token')->postJson('/api/projects', ['title' => 'Com token', 'cover' => 'desk'])->assertCreated();
    }

    public function test_recovery_sends_a_reset_link_and_does_not_reveal_unknown_accounts(): void
    {
        $user = User::factory()->create();
        Notification::fake();

        $known = $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk()->json('message');
        $this->postJson('/api/auth/forgot-password', ['email' => 'ausente@example.com'])->assertOk()->assertJsonPath('message', $known);
        Notification::assertSentTo($user, ResetPassword::class, fn (ResetPassword $notification): bool => str_contains($notification->toMail($user)->actionUrl, '/reset-password/'));
        $this->assertDatabaseCount('password_reset_tokens', 1);
    }

    public function test_valid_reset_changes_password_and_token_cannot_be_reused(): void
    {
        $user = User::factory()->create();
        $token = Password::createToken($user);
        $data = ['email' => $user->email, 'token' => $token, 'password' => 'minha nova senha 123', 'password_confirmation' => 'minha nova senha 123'];

        $this->postJson('/api/auth/reset-password', $data)->assertOk()->assertJsonPath('user', null);
        $this->assertTrue(Hash::check('minha nova senha 123', $user->fresh()->password));
        $this->postJson('/api/auth/reset-password', $data)->assertUnprocessable();
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'minha nova senha 123'])->assertOk();
    }

    public function test_expired_reset_token_returns_422_without_changing_password(): void
    {
        $user = User::factory()->create();
        $original = $user->password;
        $token = Password::createToken($user);
        $this->travel(61)->minutes();

        $this->postJson('/api/auth/reset-password', ['email' => $user->email, 'token' => $token, 'password' => 'uma nova senha 123', 'password_confirmation' => 'uma nova senha 123'])->assertUnprocessable();
        $this->assertSame($original, $user->fresh()->password);
    }
}
