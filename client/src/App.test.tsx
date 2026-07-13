import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";

describe("App", () => {
  it("renders the AlgoQuest heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "AlgoQuest" })).toBeInTheDocument();
  });
});
