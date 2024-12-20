const {
  maskIP,
  maskEmail,
  maskApiKey,
  maskSensitiveData,
  createSafeLoggingContext,
} = require("../../utils/masking");

describe("Masking Utilities", () => {
  describe("maskIP", () => {
    it("should mask IPv4 addresses", () => {
      expect(maskIP("192.168.1.1")).toBe("192.168.xxx.xxx");
      expect(maskIP("10.0.0.1")).toBe("10.0.xxx.xxx");
    });

    it("should mask IPv6 addresses", () => {
      expect(maskIP("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
        "2001:0db8:85a3:xxxx:xxxx"
      );
    });

    it("should handle localhost addresses", () => {
      expect(maskIP("127.0.0.1")).toBe("localhost");
      expect(maskIP("::1")).toBe("localhost");
    });

    it("should handle invalid or empty inputs", () => {
      expect(maskIP("")).toBe("");
      expect(maskIP(null)).toBeNull();
      expect(maskIP("invalid")).toBe("xxx.xxx.xxx.xxx");
    });
  });

  describe("maskEmail", () => {
    it("should mask email addresses", () => {
      expect(maskEmail("john.doe@example.com")).toBe("j*******e@example.com");
      expect(maskEmail("ab@test.com")).toBe("a**@test.com");
    });

    it("should handle short email addresses", () => {
      expect(maskEmail("a@test.com")).toBe("a**@test.com");
    });

    it("should handle invalid or empty inputs", () => {
      expect(maskEmail("")).toBe("");
      expect(maskEmail(null)).toBeNull();
      expect(maskEmail("invalid")).toBe("invalid");
    });
  });

  describe("maskApiKey", () => {
    it("should mask Voila API keys", () => {
      expect(maskApiKey("vk_1234567890abcdef")).toBe("vk_*******");
    });

    it("should mask other API keys", () => {
      expect(maskApiKey("1234567890abcdef")).toBe("*******");
    });

    it("should handle invalid or empty inputs", () => {
      expect(maskApiKey("")).toBe("");
      expect(maskApiKey(null)).toBeNull();
    });
  });

  describe("maskSensitiveData", () => {
    it("should mask multiple sensitive fields", () => {
      const data = {
        user: {
          email: "john.doe@example.com",
          ip: "192.168.1.1",
          apiKey: "vk_1234567890abcdef",
        },
        request: {
          ip: "10.0.0.1",
        },
      };

      const masked = maskSensitiveData(data);

      expect(masked.user.email).toBe("j*******e@example.com");
      expect(masked.user.ip).toBe("192.168.xxx.xxx");
      expect(masked.user.apiKey).toBe("vk_*******");
      expect(masked.request.ip).toBe("10.0.xxx.xxx");
    });

    it("should handle arrays of sensitive data", () => {
      const data = {
        users: [
          { email: "john@example.com", ip: "192.168.1.1" },
          { email: "jane@example.com", ip: "192.168.1.2" },
        ],
      };

      const masked = maskSensitiveData(data);

      expect(masked.users[0].email).toBe("j***n@example.com");
      expect(masked.users[0].ip).toBe("192.168.xxx.xxx");
      expect(masked.users[1].email).toBe("j***e@example.com");
      expect(masked.users[1].ip).toBe("192.168.xxx.xxx");
    });

    it("should handle null and undefined values", () => {
      const data = {
        user: {
          email: null,
          ip: undefined,
          apiKey: "",
        },
      };

      const masked = maskSensitiveData(data);

      expect(masked.user.email).toBeNull();
      expect(masked.user.ip).toBeUndefined();
      expect(masked.user.apiKey).toBe("");
    });
  });

  describe("createSafeLoggingContext", () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it("should mask data in production", () => {
      process.env.NODE_ENV = "production";

      const context = {
        user: { email: "test@example.com" },
        ip: "192.168.1.1",
      };

      const safe = createSafeLoggingContext(context);

      expect(safe.user.email).toBe("t**t@example.com");
      expect(safe.ip).toBe("192.168.xxx.xxx");
    });

    it("should not mask data in development", () => {
      process.env.NODE_ENV = "development";

      const context = {
        user: { email: "test@example.com" },
        ip: "192.168.1.1",
      };

      const safe = createSafeLoggingContext(context);

      expect(safe.user.email).toBe("test@example.com");
      expect(safe.ip).toBe("192.168.1.1");
    });
  });
});
