import { describe, it, expect } from 'vitest';
import { canAccess, matchAdminRoute, ADMIN_ROUTE_ACCESS, isAdminRole } from '../src/lib/admin-roles';

describe('admin role gating', () => {
  describe('matchAdminRoute', () => {
    it('picks the most specific match (longest prefix)', () => {
      expect(matchAdminRoute('/admin/leads/123')).toBe('/admin/leads');
      expect(matchAdminRoute('/admin/salons/abc/details')).toBe('/admin/salons');
      expect(matchAdminRoute('/admin')).toBe('/admin');
    });

    it('falls back to /admin for unknown sub-routes', () => {
      expect(matchAdminRoute('/admin/some-future-route')).toBe('/admin');
    });
  });

  describe('canAccess', () => {
    it('super_admin sees everything', () => {
      for (const route of Object.keys(ADMIN_ROUTE_ACCESS)) {
        expect(canAccess('super_admin', route)).toBe(true);
      }
    });

    it('leads_team sees only /admin and /admin/leads and /admin/profile', () => {
      expect(canAccess('leads_team', '/admin')).toBe(true);
      expect(canAccess('leads_team', '/admin/leads')).toBe(true);
      expect(canAccess('leads_team', '/admin/profile')).toBe(true);
      // Blocked
      expect(canAccess('leads_team', '/admin/agents')).toBe(false);
      expect(canAccess('leads_team', '/admin/payments')).toBe(false);
      expect(canAccess('leads_team', '/admin/settings')).toBe(false);
      expect(canAccess('leads_team', '/admin/team')).toBe(false);
    });

    it('customer_support sees salons, payments, users — not agents/payouts', () => {
      expect(canAccess('customer_support', '/admin/salons')).toBe(true);
      expect(canAccess('customer_support', '/admin/payments')).toBe(true);
      expect(canAccess('customer_support', '/admin/users')).toBe(true);
      expect(canAccess('customer_support', '/admin/agents')).toBe(false);
      expect(canAccess('customer_support', '/admin/payouts')).toBe(false);
      expect(canAccess('customer_support', '/admin/leads')).toBe(false);
    });

    it('technical_support extends customer_support with analytics + settings', () => {
      expect(canAccess('technical_support', '/admin/analytics')).toBe(true);
      expect(canAccess('technical_support', '/admin/settings')).toBe(true);
      expect(canAccess('technical_support', '/admin/salons')).toBe(true);
      expect(canAccess('technical_support', '/admin/agents')).toBe(false);
      expect(canAccess('technical_support', '/admin/team')).toBe(false);
    });

    it('rejects unknown roles and undefined', () => {
      expect(canAccess(undefined, '/admin')).toBe(false);
      expect(canAccess('owner', '/admin')).toBe(false);
      expect(canAccess('sales_agent', '/admin/leads')).toBe(false);
    });

    it('only super_admin can access /admin/team and /admin/agents', () => {
      for (const role of ['leads_team', 'customer_support', 'technical_support']) {
        expect(canAccess(role, '/admin/team')).toBe(false);
        expect(canAccess(role, '/admin/agents')).toBe(false);
      }
      expect(canAccess('super_admin', '/admin/team')).toBe(true);
      expect(canAccess('super_admin', '/admin/agents')).toBe(true);
    });
  });

  describe('isAdminRole', () => {
    it('accepts only the four documented roles', () => {
      expect(isAdminRole('super_admin')).toBe(true);
      expect(isAdminRole('leads_team')).toBe(true);
      expect(isAdminRole('customer_support')).toBe(true);
      expect(isAdminRole('technical_support')).toBe(true);
      expect(isAdminRole('owner')).toBe(false);
      expect(isAdminRole(undefined)).toBe(false);
      expect(isAdminRole('')).toBe(false);
    });
  });
});
