import 'jasmine';
import {hashPassword, verifyPassword, signup, verifyEmail, login, rotateRefreshToken} from './user_auth';
import {SupabaseClient} from './supabase_client';
import {AuthError} from './errors';

describe('UserAuth Systems', () => {
  let db: SupabaseClient;
  const jwtSecret = 'test_jwt_secret_xyz123';

  beforeEach(() => {
    db = new SupabaseClient('http://mock_url', 'mock_key');
    // Enable local mock DB to ensure complete test isolation
    SupabaseClient.useSharedMockDb = false;
  });

  describe('Password Hashing & Constant-time Verification', () => {
    it('should hash a password with random salt and verify it successfully', async () => {
      const pw = 'SuperSecret123!';
      const hash = await hashPassword(pw);
      expect(hash).toContain(':');

      const matches = await verifyPassword(pw, hash);
      expect(matches).toBeTrue();

      const wrongMatch = await verifyPassword('WrongPassword!', hash);
      expect(wrongMatch).toBeFalse();
    });

    it('should fail gracefully on corrupted hashes', async () => {
      const matches = await verifyPassword('test', 'badhash');
      expect(matches).toBeFalse();
    });
  });

  describe('User Registration & Verification Lifecycle', () => {
    it('should sign up, verify email, and log in successfully', async () => {
      const email = 'newuser@example.com';
      const pw = 'Password123!';
      const org = 'My First Org';

      // 1. Signup
      const {user, verificationToken} = await signup(db, email, pw, org, jwtSecret);
      expect(user.email).toBe(email);
      expect(user.status).toBe('pending_verification');
      expect(verificationToken).toBeDefined();

      // 2. Block login before verification
      await expectAsync(login(db, email, pw, jwtSecret)).toBeRejectedWithError(
        AuthError,
        'Email verification required',
      );

      // 3. Verify Email
      const verifySuccess = await verifyEmail(db, verificationToken, jwtSecret);
      expect(verifySuccess).toBeTrue();

      const updatedUser = await db.getUserById(user.user_id);
      expect(updatedUser?.status).toBe('active');

      // 4. Login
      const {accessToken, refreshToken} = await login(db, email, pw, jwtSecret);
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
    });

    it('should reject signup for duplicate emails', async () => {
      const email = 'dup@example.com';
      await signup(db, email, 'pw123', 'Org', jwtSecret);

      await expectAsync(signup(db, email, 'pw456', 'Org2', jwtSecret)).toBeRejectedWithError(
        AuthError,
        'User already exists',
      );
    });
  });

  describe('Refresh Token Rotation & Security', () => {
    it('should rotate refresh tokens and revoke old ones', async () => {
      const email = 'refresh@example.com';
      const pw = 'pw123!';
      const {user, verificationToken} = await signup(db, email, pw, 'Org', jwtSecret);
      await verifyEmail(db, verificationToken, jwtSecret);

      const {accessToken, refreshToken} = await login(db, email, pw, jwtSecret);

      // Rotate once
      const rotation1 = await rotateRefreshToken(db, refreshToken, jwtSecret);
      expect(rotation1.accessToken).toBeDefined();
      expect(rotation1.refreshToken).not.toBe(refreshToken);

      // Attempting to reuse the old refresh token must trigger compromise detection and revoke all tokens!
      await expectAsync(rotateRefreshToken(db, refreshToken, jwtSecret)).toBeRejectedWithError(
        AuthError,
        'Token compromised: session revoked',
      );

      // Verify all tokens for the user are now revoked
      const storedTokens = await db.getRefreshTokensForUser(user.user_id);
      expect(storedTokens.length).toBeGreaterThan(0);
      expect(storedTokens.every(t => t.revoked)).toBeTrue();
    });
  });
});
