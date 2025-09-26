/**
 * CIDR validation utility for IP address checking
 * Used for secure proxy trust configuration
 */

/**
 * Parse an IP address and return as an array of octets
 * @param {string} ip - IP address string
 * @returns {number[]} Array of octets
 */
function parseIP(ip) {
  if (typeof ip !== 'string') {
    throw new Error(`Invalid IP address: ${ip}`);
  }

  const parts = ip.trim().split('.');
  if (parts.length !== 4) {
    throw new Error(`Invalid IP address: ${ip}`);
  }

  const octets = parts.map(part => {
    if (!/^\d+$/.test(part)) {
      throw new Error(`Invalid IP address: ${ip}`);
    }

    const value = Number(part);
    if (value < 0 || value > 255) {
      throw new Error(`Invalid IP address: ${ip}`);
    }
    return value;
  });

  return octets;
}

/**
 * Convert IP address to integer
 * @param {string} ip - IP address string
 * @returns {number} IP as integer
 */
function ipToInt(ip) {
  const parts = parseIP(ip);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Check if an IP address is within a CIDR range
 * @param {string} ip - IP address to check
 * @param {string} cidr - CIDR notation (e.g., "192.168.1.0/24")
 * @returns {boolean} True if IP is within CIDR range
 */
function isIPInCIDR(ip, cidr) {
  try {
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);
    
    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      throw new Error(`Invalid prefix length: ${prefixLength}`);
    }
    
    const ipInt = ipToInt(ip);
    const networkInt = ipToInt(network);
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    
    return (ipInt & mask) === (networkInt & mask);
  } catch (error) {
    console.warn(`CIDR validation error for ${ip} in ${cidr}:`, error.message);
    return false;
  }
}

/**
 * Check if an IP address matches any of the provided CIDR ranges
 * @param {string} ip - IP address to check
 * @param {string[]} cidrs - Array of CIDR strings
 * @returns {boolean} True if IP matches any CIDR
 */
function isIPInAnyCIDR(ip, cidrs) {
  if (!Array.isArray(cidrs) || cidrs.length === 0) {
    return false;
  }
  
  return cidrs.some(cidr => isIPInCIDR(ip, cidr.trim()));
}

/**
 * Parse comma-separated CIDR string into array
 * @param {string} cidrString - Comma-separated CIDR string
 * @returns {string[]} Array of CIDR strings
 */
function parseCIDRString(cidrString) {
  if (!cidrString || typeof cidrString !== 'string') {
    return [];
  }
  
  return cidrString
    .split(',')
    .map(cidr => cidr.trim())
    .filter(cidr => cidr.length > 0);
}

/**
 * Validate CIDR format
 * @param {string} cidr - CIDR string to validate
 * @returns {boolean} True if CIDR format is valid
 */
function isValidCIDR(cidr) {
  try {
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);
    
    // Validate network part
    parseIP(network);
    
    // Validate prefix length
    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

export {
  isIPInCIDR,
  isIPInAnyCIDR,
  parseCIDRString,
  isValidCIDR,
  ipToInt,
  parseIP
};
