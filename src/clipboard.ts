import { spawnSync } from "node:child_process";
import { platform } from "node:os";

export function copyToClipboard(text: string): boolean {
  const os = platform();
  if (os === "darwin") return pipeTo("pbcopy", []);
  if (os === "win32") return pipeTo("clip", []);
  return (
    pipeTo("wl-copy", []) ||
    pipeTo("xclip", ["-selection", "clipboard"]) ||
    pipeTo("xsel", ["--clipboard", "--input"])
  );

  function pipeTo(command: string, args: string[]): boolean {
    const result = spawnSync(command, args, {
      input: text,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "ignore"],
    });
    return result.status === 0;
  }
}
