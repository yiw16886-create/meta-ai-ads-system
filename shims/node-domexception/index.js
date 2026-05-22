const domException = typeof globalThis !== 'undefined' && globalThis.DOMException
  ? globalThis.DOMException
  : typeof global !== 'undefined' && global.DOMException
    ? global.DOMException
    : class DOMException extends Error {
        constructor(message, name) {
          super(message);
          this.name = name || 'DOMException';
        }
      };

module.exports = domException;
module.exports.default = domException;
module.exports.DOMException = domException;
