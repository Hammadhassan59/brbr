import { describe, it, expect } from 'vitest';
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode('test-secret');

describe('JWT session tokens', () => {
  it('should sign and verify a session payload', async () => {
    const payload = { salonId: '123', staffId: '456', role: 'owner', branchId: '789', name: 'Test' };

    const token = await new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(SECRET);

    const { payload: decoded } = await jwtVerify(token, SECRET);
    expect(decoded.salonId).toBe('123');
    expect(decoded.staffId).toBe('456');
    expect(decoded.role).toBe('owner');
    expect(decoded.branchId).toBe('789');
    expect(decoded.name).toBe('Test');
  });

  it('should reject tampered tokens', async () => {
    const token = 'invalid.token.here';
    await expect(jwtVerify(token, SECRET)).rejects.toThrow();
  });

  it('should reject tokens signed with wrong secret', async () => {
    const wrongSecret = new TextEncoder().encode('wrong-secret');
    const payload = { salonId: '123', staffId: '456', role: 'owner', branchId: '789', name: 'Test' };

    const token = await new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(wrongSecret);

    await expect(jwtVerify(token, SECRET)).rejects.toThrow();
  });

  it('should reject expired tokens', async () => {
    const payload = { salonId: '123', staffId: '456', role: 'owner', branchId: '789', name: 'Test' };

    const token = await new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 86500)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
      .sign(SECRET);

    await expect(jwtVerify(token, SECRET)).rejects.toThrow();
  });
});
