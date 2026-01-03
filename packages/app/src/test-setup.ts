import "@testing-library/jest-dom";

// Only set up browser mocks when running in jsdom environment
if (typeof window !== "undefined") {
  // Mock window.matchMedia for tests
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Mock localStorage
  const localStorageMock = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
  });
}
