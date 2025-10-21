/**
 * Production CSP verification tests
 * 
 * These tests specifically verify that the CSP configuration
 * correctly excludes 'unsafe-eval' in production environments.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCSPConfig, generateCSPForHeaders } from '../security';

describe('Production CSP Security', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should exclude unsafe-eval from script-src in production', () => {
      const config = getCSPConfig();
      
      expect(config['script-src']).not.toContain("'unsafe-eval'");
      expect(config['script-src']).toContain("'self'");
      expect(config['script-src']).toContain("'unsafe-inline'");
    });

    it('should generate CSP string without unsafe-eval in production', () => {
      const csp = generateCSPForHeaders();
      
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    });

    it('should maintain all other security directives in production', () => {
      const csp = generateCSPForHeaders();
      
      // Verify all required security directives are present
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("upgrade-insecure-requests");
    });

    it('should have proper CSP formatting in production', () => {
      const csp = generateCSPForHeaders();
      
      // Should be properly formatted with semicolons
      expect(csp).toMatch(/^[^;]+;[^;]+;.*$/);
      
      // Should not have double semicolons
      expect(csp).not.toContain(';;');
      
      // Should end with a directive (no trailing semicolon)
      expect(csp).not.toMatch(/;$/);
    });
  });

  describe('Development vs Production Comparison', () => {
    it('should have different script-src between development and production', () => {
      // Test development
      process.env.NODE_ENV = 'development';
      const devConfig = getCSPConfig();
      const devCSP = generateCSPForHeaders();
      
      // Test production
      process.env.NODE_ENV = 'production';
      const prodConfig = getCSPConfig();
      const prodCSP = generateCSPForHeaders();
      
      // Development should include unsafe-eval
      expect(devConfig['script-src']).toContain("'unsafe-eval'");
      expect(devCSP).toContain("'unsafe-eval'");
      
      // Production should NOT include unsafe-eval
      expect(prodConfig['script-src']).not.toContain("'unsafe-eval'");
      expect(prodCSP).not.toContain("'unsafe-eval'");
      
      // All other directives should be identical (connect-src differs by http: in dev)
      expect(devConfig['default-src']).toEqual(prodConfig['default-src']);
      expect(devConfig['style-src']).toEqual(prodConfig['style-src']);
      expect(devConfig['font-src']).toEqual(prodConfig['font-src']);
      expect(devConfig['img-src']).toEqual(prodConfig['img-src']);
      expect(devConfig['connect-src']).toContain('http://localhost:*');
      expect(prodConfig['connect-src']).not.toContain('http://localhost:*');
    });

    it('should maintain security in all non-development environments', () => {
      const environments = ['production', 'test', 'staging'];
      
      environments.forEach(env => {
        process.env.NODE_ENV = env;
        const config = getCSPConfig();
        const csp = generateCSPForHeaders();
        
        expect(config['script-src']).not.toContain("'unsafe-eval'"), 
          `Environment ${env} should not include unsafe-eval`;
        expect(csp).not.toContain("'unsafe-eval'"), 
          `CSP in ${env} should not include unsafe-eval`;
      });
    });
  });

  describe('CSP Security Validation', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should have secure default-src directive', () => {
      const config = getCSPConfig();
      expect(config['default-src']).toEqual(["'self'"]);
    });

    it('should block dangerous frame sources', () => {
      const config = getCSPConfig();
      expect(config['frame-src']).toEqual(["'none'"]);
    });

    it('should block dangerous object sources', () => {
      const config = getCSPConfig();
      expect(config['object-src']).toEqual(["'none'"]);
    });

    it('should restrict base URI to self', () => {
      const config = getCSPConfig();
      expect(config['base-uri']).toEqual(["'self'"]);
    });

    it('should restrict form actions to self', () => {
      const config = getCSPConfig();
      expect(config['form-action']).toEqual(["'self'"]);
    });

    it('should block frame ancestors', () => {
      const csp = generateCSPForHeaders();
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should upgrade insecure requests', () => {
      const config = getCSPConfig();
      expect(config['upgrade-insecure-requests']).toEqual([]);
    });
  });
});
