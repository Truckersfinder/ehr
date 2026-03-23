import { createRoot } from "react-dom/client";
import { installDevApiFetchShim } from "@/lib/dev-api-fetch";
import App from "./App";
import "./index.css";

installDevApiFetchShim();

createRoot(document.getElementById("root")!).render(<App />);
