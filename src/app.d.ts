// See https://svelte.dev/docs/kit/types#app.d.ts

import type { Session, User } from "better-auth";
import type { DevConsoleAPI } from "$lib/bootstrap/dev-console";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user?: User;
      session?: Session;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  // Dev console (development mode only)
  interface Window {
    pa?: DevConsoleAPI;
  }
}
