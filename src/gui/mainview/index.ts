// Dumb view over the RPC schema: all integration logic lives in the Bun main process.
import { Electroview } from "electrobun/view";
import type { AppDto, GuiSchema } from "../rpc.ts";

const listEl = document.getElementById("app-list") as HTMLUListElement;
const emptyEl = document.getElementById("empty-state") as HTMLParagraphElement;
const toastArea = document.getElementById("toast-area") as HTMLDivElement;

function toast(text: string): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toastArea.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

const electroview = new Electroview<ReturnType<typeof makeRpc>>({
  rpc: makeRpc(),
});

function makeRpc() {
  return Electroview.defineRPC<GuiSchema>({
    handlers: {
      messages: {
        appsChanged: () => {
          void refresh();
        },
      },
    },
  });
}

const rpc = electroview.rpc;

async function refresh(): Promise<void> {
  if (!rpc) return;
  let apps: AppDto[];
  try {
    apps = (await rpc.request.listApps(undefined)) as AppDto[];
  } catch (e) {
    toast(`Could not list apps: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  render(apps);
}

function render(apps: AppDto[]): void {
  listEl.textContent = "";
  emptyEl.style.display = apps.length === 0 ? "" : "none";
  for (const app of apps) {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "app-name";
    name.textContent = app.name;
    name.title = app.appImagePath;
    li.appendChild(name);

    const version = document.createElement("span");
    version.className = "app-version";
    version.textContent = app.version ?? "";
    li.appendChild(version);

    const actions = document.createElement("span");
    actions.className = "row-actions";

    const launch = document.createElement("button");
    launch.type = "button";
    launch.textContent = "Launch";
    launch.addEventListener("click", () => {
      void launchApp(app.appId);
    });
    actions.appendChild(launch);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      if (window.confirm(`Remove ${app.name}? This deletes its image, menu entry, and icons.`)) {
        void removeApp(app.appId);
      }
    });
    actions.appendChild(remove);

    li.appendChild(actions);
    listEl.appendChild(li);
  }
}

async function launchApp(appId: string): Promise<void> {
  if (!rpc) return;
  try {
    await rpc.request.launchApp({ appId });
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  }
}

async function removeApp(appId: string): Promise<void> {
  if (!rpc) return;
  try {
    await rpc.request.removeApp({ appId });
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  }
}

async function addApps(): Promise<void> {
  if (!rpc) return;
  try {
    const result = await rpc.request.addApps(undefined);
    if (result.cancelled) return;
    for (const info of result.installed) {
      toast(`Installed ${info.name}`);
      for (const warning of info.warnings) toast(`warning: ${info.appId}: ${warning}`);
    }
    for (const failure of result.failed) {
      toast(`Failed: ${failure.file}: ${failure.error}`);
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  }
}

document.getElementById("add-button")?.addEventListener("click", () => {
  void addApps();
});

void refresh();
