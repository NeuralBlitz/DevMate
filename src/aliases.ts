export const aliases: Record<string, string> = {
  ll: "ls -la", la: "ls -a", l: "ls -la", llh: "ls -lah", lt: "ls -ltr",
  g: "git", gs: "git status", ga: "git add", gaa: "git add .", gc: "git commit",
  gcm: "git commit -m", gp: "git push", gpl: "git pull", gd: "git diff", gdc: "git diff --cached",
  gco: "git checkout", co: "checkout", br: "branch", brr: "branches", brd: "branch -d",
  st: "status", sts: "git status -s", lg: "git log --oneline -20",
  d: "docker", dc: "docker compose", dps: "docker ps", dpa: "docker ps -a",
  di: "docker images", dex: "docker exec -it", dlog: "docker logs",
  k: "kubectl", ka: "kubectl get all", kgp: "kubectl get pods", kgs: "kubectl get svc",
  kgd: "kubectl get deploy", kga: "kubectl get all -A", kdp: "kubectl describe pod",
  h: "htop", t: "top", i: "htop", v: "vim", n: "nano", e: "vim",
  q: "exit", x: "exit", qq: "exit", c: "clear", cls: "clear",
  py: "python", py3: "python3", pipi: "pip install", pips: "pip install -r requirements.txt",
  npmi: "npm install", npms: "npm install", npmd: "npm run dev", npmb: "npm run build",
  yai: "yarn add", yad: "yarn add -D", ydev: "yarn dev", ybuild: "yarn build"
};

/**
 * Resolve only the first command token, preserving original argument spacing.
 * A custom mapping overrides a built-in alias. Inherited object properties
 * must never be treated as aliases.
 */
export function resolveAlias(input: string, customAliases: Record<string, unknown> = {}): string {
  const raw = input.trim();
  if (!raw) return raw;

  const firstWord = raw.split(/\s+/, 1)[0];
  const mapping: Record<string, unknown> = { ...aliases, ...customAliases };
  const key = firstWord.toLowerCase();
  if (!Object.hasOwn(mapping, key)) return raw;

  const expansion = mapping[key];
  return typeof expansion === "string" && expansion.length > 0
    ? expansion + raw.slice(firstWord.length)
    : raw;
}
