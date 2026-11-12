// Shared RPC schema and DTOs between the Electrobun main process and the webview.
// DTOs are plain JSON-safe types; the webview never sees core module types.
import type { ElectrobunRPCSchema } from "electrobun/rpc";

export interface AppDto {
  readonly appId: string;
  readonly name: string;
  readonly version: string | null;
  readonly appImagePath: string;
}

export interface InstalledAppInfo {
  readonly appId: string;
  readonly name: string;
  readonly warnings: readonly string[];
}

export interface AddResultDto {
  readonly installed: readonly InstalledAppInfo[];
  readonly failed: readonly { readonly file: string; readonly error: string }[];
  readonly cancelled: boolean;
}

export interface GuiSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      listApps: { params: undefined; response: AppDto[] };
      addApps: { params: undefined; response: AddResultDto };
      removeApp: { params: { appId: string }; response: { removed: true } };
      launchApp: { params: { appId: string }; response: { launched: true } };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<never, unknown>;
    messages: {
      appsChanged: Record<string, never>;
    };
  };
}
