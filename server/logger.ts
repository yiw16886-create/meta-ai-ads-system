import { AsyncLocalStorage } from "async_hooks";

export const logContext = new AsyncLocalStorage<{ is_silent?: boolean }>();

export const originalConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error
};

const isSilentActive = () => {
  const store = logContext.getStore();
  return store?.is_silent === true;
};

// Override console methods globally to dynamic throttle
console.log = function (message?: any, ...optionalParams: any[]) {
  if (isSilentActive()) {
    // Throttled: do not output to standard stdout
    return;
  }
  originalConsole.log(message, ...optionalParams);
};

console.info = function (message?: any, ...optionalParams: any[]) {
  if (isSilentActive()) {
    return;
  }
  originalConsole.info(message, ...optionalParams);
};

console.debug = function (message?: any, ...optionalParams: any[]) {
  if (isSilentActive()) {
    return;
  }
  originalConsole.debug(message, ...optionalParams);
};

console.warn = function (message?: any, ...optionalParams: any[]) {
  // Always output warnings
  originalConsole.warn(message, ...optionalParams);
};

console.error = function (message?: any, ...optionalParams: any[]) {
  // Always output errors
  originalConsole.error(message, ...optionalParams);
};

// Add custom force methods to global console for specific lifecycle logs
(console as any).forceLog = function (message?: any, ...optionalParams: any[]) {
  originalConsole.log(message, ...optionalParams);
};

(console as any).forceInfo = function (message?: any, ...optionalParams: any[]) {
  originalConsole.info(message, ...optionalParams);
};

// Custom logger wrapper for nice API and easy migration if desired
export const logger = {
  log: (message?: any, ...optionalParams: any[]) => {
    if (!isSilentActive()) {
      originalConsole.log(message, ...optionalParams);
    }
  },
  info: (message?: any, ...optionalParams: any[]) => {
    if (!isSilentActive()) {
      originalConsole.info(message, ...optionalParams);
    }
  },
  debug: (message?: any, ...optionalParams: any[]) => {
    if (!isSilentActive()) {
      originalConsole.debug(message, ...optionalParams);
    }
  },
  warn: (message?: any, ...optionalParams: any[]) => {
    originalConsole.warn(message, ...optionalParams);
  },
  error: (message?: any, ...optionalParams: any[]) => {
    originalConsole.error(message, ...optionalParams);
  },
  forceLog: (message?: any, ...optionalParams: any[]) => {
    originalConsole.log(message, ...optionalParams);
  },
  forceInfo: (message?: any, ...optionalParams: any[]) => {
    originalConsole.info(message, ...optionalParams);
  }
};
