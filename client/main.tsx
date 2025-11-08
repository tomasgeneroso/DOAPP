import { createRoot } from "react-dom/client";
import App from "./App";
import "./global.css";
import "./styles/datepicker.css";
import "react-quill/dist/quill.snow.css";
import "./styles/quill-dark.css";

createRoot(document.getElementById("root")!).render(<App />);
