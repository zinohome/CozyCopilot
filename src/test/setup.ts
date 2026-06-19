import "@testing-library/jest-dom/vitest";
// M7.4: add the `toHaveNoViolations` matcher to `expect(...)`.
// The submodule side-effect-imports the global types so the matcher
// is available in every test file with no extra setup.
import "vitest-axe/extend-expect";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../../mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
