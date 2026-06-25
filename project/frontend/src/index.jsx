import React from "react";
import { createRoot } from 'react-dom/client';
import "./index.css";
import App from "./App";
import * as serviceWorker from "./serviceWorkerRegistration";
import * as Sentry from "@sentry/react";

if (window.location.host === "mapdump.com") {
  Sentry.init({
    dsn: "https://5883ab6ef34af5b702bb72e4691b5f7a@o4510374623117312.ingest.de.sentry.io/4511573960556624",
  });
}

const container = document.getElementById('root')
const root = createRoot(container); // createRoot(container!) if you use TypeScript
root.render(
  <App />
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
