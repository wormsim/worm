"use client";

/* Starts the homepage's moving parts once the server-rendered page is on screen.
   Everything it touches is already readable without it; see ./live.ts. */

import { useEffect } from "react";
import { mount } from "./live";

export default function LiveMount() {
  useEffect(() => mount(document), []);
  return null;
}
