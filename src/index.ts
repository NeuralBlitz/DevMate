#!/usr/bin/env bun

import readline from "readline";
import chalk from "chalk";
import { execSync, spawn, spawnSync } from "child_process";
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync, appendFileSync } from "fs";
import { join, resolve, dirname, basename } from "path";

const HOME = process.env.HOME || "/tmp";
const CONFIG_DIR = join(HOME, ".devmate");
mkdirSync(CONFIG_DIR, { recursive: true });

const commandHistory: string[] = [];
const aliases: Record<string, string> = {
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

const OPENCODE_PATH = process.env.OPENCODE_PATH || "/home/runner/workspace/.config/npm/node_global/bin/opencode";

function loadJSON(file: string, fallback: any = {}) {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : fallback; } 
  catch { return fallback; }
}

function saveJSON(file: string, data: any) {
  try { writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}

let customCommands = loadJSON(join(CONFIG_DIR, "custom_commands.json"), {});
let aliasesCustom = loadJSON(join(CONFIG_DIR, "aliases.json"), {});
let snippets = loadJSON(join(CONFIG_DIR, "snippets.json"), {});
let bookmarks = loadJSON(join(CONFIG_DIR, "bookmarks.json"), {});

function saveAll() {
  saveJSON(join(CONFIG_DIR, "custom_commands.json"), customCommands);
  saveJSON(join(CONFIG_DIR, "aliases.json"), aliasesCustom);
  saveJSON(join(CONFIG_DIR, "snippets.json"), snippets);
  saveJSON(join(CONFIG_DIR, "bookmarks.json"), bookmarks);
}

function err(msg: string, hint?: string) {
  console.log(chalk.red(`✗ ${msg}`));
  if (hint) console.log(chalk.gray(`💡 ${hint}`));
}

function success(msg: string) { console.log(chalk.green(`✓ ${msg}`)); }
function info(msg: string) { console.log(chalk.cyan(`ℹ ${msg}`)); }
function warn(msg: string) { console.log(chalk.yellow(`⚠ ${msg}`)); }

function handleError(cmd: string, e: any, suggestion?: string) {
  const msg = (e.message || "").toLowerCase();
  const hints: Record<string, { msg: string; hint: string }> = {
    "not found": { msg: `${cmd} not found`, hint: getInstallHint(cmd) },
    "command not found": { msg: `${cmd} not found`, hint: getInstallHint(cmd) },
    "permission denied": { msg: "Permission denied", hint: "Try sudo or check permissions" },
    "eacces": { msg: "Permission denied", hint: "Use sudo for system-wide access" },
    "enoent": { msg: "File/directory not found", hint: "Check path or create it" },
    "network": { msg: "Network error", hint: "Check internet connection" },
    "timeout": { msg: "Connection timeout", hint: "Server may be down, try again" },
    "already exists": { msg: "Already exists", hint: "Use different name or remove first" },
    "not a git": { msg: "Not a git repository", hint: "Run git init or cd into a repo" },
    "nothing to commit": { msg: "Nothing to commit", hint: "Make changes first" },
    "refusing to merge": { msg: "Merge conflict", hint: "Resolve conflicts manually" },
    "detached": { msg: "HEAD detached", hint: "Checkout a branch: git checkout <branch>" },
    "cannot connect": { msg: "Cannot connect", hint: "Start service: sudo systemctl start <service>" },
    "lock": { msg: "Resource locked", hint: "Wait or kill conflicting process" },
    "externally-managed": { msg: "Python venv required", hint: "python -m venv .venv && source .venv/bin/activate" },
    "no module named": { msg: "Python module missing", hint: `pip install ${e.message?.match(/'([^']+)'/)?.[1] || "module"}` },
    "command failed": { msg: "Command failed", hint: suggestion || getInstallHint(cmd) },
  };
  
  for (const [key, val] of Object.entries(hints)) {
    if (msg.includes(key)) {
      err(val.msg, val.hint);
      return;
    }
  }
  err(e.message?.split("\n")[0] || "Error", suggestion || getInstallHint(cmd));
}

function getInstallHint(cmd: string): string {
  const hints: Record<string, string> = {
    npm: "npm install -g npm", yarn: "npm install -g yarn", pnpm: "npm install -g pnpm",
    bun: "curl -fsSL https://bun.sh/install | bash",
    pip: "python3 -m pip install --user pip", pipx: "python3 -m pip install --user pipx",
    poetry: "curl -sSL https://install.python-poetry.org | python3 -",
    go: "https://go.dev/dl/", cargo: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
    docker: "curl -fsSL https://get.docker.com | sh",
    kubectl: "curl -LO https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl",
    helm: "curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash",
    terraform: "curl -fsSL https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip",
    ansible: "pip install ansible", aws: "curl https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip",
    gcloud: "curl https://sdk.cloud.google.com | bash", az: "curl -fsSL https://aka.ms/installazurecliz | bash",
    brew: "/bin/bash -c '$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)'",
    htop: "sudo apt install htop", tree: "sudo apt install tree",
    fortune: "sudo apt install fortune-mod", cmatrix: "sudo apt install cmatrix",
    sl: "sudo apt install sl", cowsay: "sudo apt install cowsay",
    ffmpeg: "sudo apt install ffmpeg", convert: "sudo apt install imagemagick",
    rclone: "curl https://rclone.org/install.sh | sudo bash",
    fzf: "git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf && ~/.fzf/install",
    rg: "cargo install ripgrep", fd: "cargo install fd-find",
    bat: "cargo install bat", exa: "cargo install exa",
    lf: "go install github.com/gokcehan/lf@latest", yazi: "cargo install yazi",
    zoxide: "curl -sS https://zoxide.dev/install.sh | bash",
    eza: "cargo install eza", starship: "curl -sS https://starship.rs/install.sh | sh",
    zsh: "sudo apt install zsh", fish: "sudo apt install fish",
    ohmyposh: "curl -sSL https://ohmyposh.dev/install.sh | sudo bash -s",
    playwright: "npm install -g playwright", cypress: "npm install -g cypress",
    puppeteer: "npm install -g puppeteer", jest: "npm install -g jest",
    vitest: "npm install -g vitest", mocha: "npm install -g mocha",
    pytest: "pip install pytest", rspec: "gem install rspec",
    mysql: "sudo apt install mysql-client", psql: "sudo apt install postgresql-client",
    mongosh: "npm install -g mongosh", redis: "sudo apt install redis-tools",
    sqlite: "sudo apt install sqlite3", neofetch: "sudo apt install neofetch",
    btop: "sudo apt install btop", glances: "pip install glances",
    speedtest: "pip install speedtest-cli", ncdu: "sudo apt install ncdu",
    postman: "sudo snap install postman", insomnia: "sudo apt install insomnia",
    httpie: "pip install httpie", wscat: "npm install -g wscat",
    grpc: "go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest",
    grpcurl: "go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest",
    tmux: "sudo apt install tmux", keycloak: "Download from keycloak.org",
    auth0: "npm install -g auth0-cli", clerk: "npx @clerk/cli",
    pusher: "gem install pusher", ably: "npm install -g ably-cli",
    pubnub: "npm install -g pubnub-cli",
  };
  return hints[cmd] || `Install ${cmd} for your OS`;
}

const Table = require('cli-table3');
const asciichart = require('asciichart');
const { marked } = require('marked');

function tableRender(headers: string[], rows: string[][], options: { headColor?: string } = {}) {
  const headColor = options.headColor || 'cyan';
  const table = new Table({ head: headers.map(h => chalk[headColor](h)) });
  rows.forEach(row => table.push(row));
  console.log(table.toString());
}

function treeRender(dir: string, prefix = '', maxDepth = 3, currentDepth = 0): string {
  if (currentDepth >= maxDepth) return '';
  let output = '';
  try {
    const entries = readdirSync(dir).filter(e => !e.startsWith('.') && e !== 'node_modules');
    entries.forEach((entry, i) => {
      const fullPath = join(dir, entry);
      const isLast = i === entries.length - 1;
      const stat = statSync(fullPath);
      const icon = stat.isDirectory() ? chalk.blue('📁') : '📄';
      const size = stat.isFile() ? `  ${(stat.size / 1024).toFixed(1)}KB` : chalk.gray('(dir)');
      output += `${prefix}${isLast ? '└── ' : '├── '}${icon} ${entry}${size}\n`;
      if (stat.isDirectory()) {
        output += treeRender(fullPath, prefix + (isLast ? '    ' : '│   '), maxDepth, currentDepth + 1);
      }
    });
  } catch {}
  return output;
}

function chartRender(data: number[], options: { title?: string; height?: number; color?: string } = {}) {
  const height = options.height || 12;
  const color = options.color || 'green';
  const config = {
    colors: [asciichart[color]],
    height: height
  };
  if (options.title) console.log(chalk.cyan(options.title));
  console.log(asciichart.plot(data, config));
}

function mdRender(markdown: string) {
  const html = marked.parse(markdown) as string;
  console.log(chalk.gray(html.replace(/<[^>]+>/g, '')));
}

function progressBar(current: number, total: number, width = 30) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((width * current) / total);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${percent}%`;
}

const rl = readline.createInterface({
  input: process.stdin, output: process.stdout, 
  prompt: chalk.gray("devmate ")
});

const COMPLETIONS = [
  // Core
  "help","version","install","setup","doctor","diag","check",
  "sysinfo","system-info","sys","ports","listening","refresh","reload",
  "quick","actions","what","which",
  // NPM
  "npm-outdated","outdated","npm-audit","audit","npm-deps","deps","npm-scripts","scripts","npm-info","pkg-info","node-version","bun-version",
  // Files
  "find-files","ff","find-dirs","fd","recent","recent-files","size","big-files","disk-usage","count","line-count",
  // Text/Utils
  "uuid","guid","hash","checksum","base64-encode","b64e","base64-decode","b64d","url-encode","urle","url-decode","urld","random","rand","password","passgen",
  "json-validate","json-valid","json-minify","json-min","json-path","jpath",
  // Docker/K8s
  "d","docker-ps","dps","dpa","docker-ps-all","di","docker-images","dstop","docker-stop-all","drm","docker-rm-all","drmi","dclean","docker-clean","dlogs","docker-logs","dex","docker-exec","dc","dcompose","docker-compose-cmd",
  "k","kubectl-cmd","kgp","k8s-pods","kgs","k8s-svc","kgd","k8s-deploy","kga","k8s-all","kd","k8s-describe","kl","k8s-logs","kctx","k8s-contexts","kns","k8s-ns",
  // Cloud
  "aws-cmd","aws-s3-ls","s3ls","s3cp","s3-copy","s3sync","s3-sync","gcloud-cmd","az-cmd",
  // Monitoring
  "htop-cmd","top-cmd","btop-cmd","btop","glances-cmd","glances","iotop-cmd","iotop","iftop-cmd","iftop","ncdu-cmd","ncdu","strace-cmd","strace","lsof-cmd","lsof","ss-netstat","ss",
  // Logs
  "logs","journal","dmesg-cmd","dmesg",
  // Process
  "pkill-cmd","pkill","killall-cmd","killall","pids","all-pids",
  // Network
  "curl-headers","curl-h","curl-json","curl-j","wget-cmd","wget","ssh-cmd","ssh","scp-cmd","scp","rsync-cmd","rsync","dig-cmd","dig","nslookup-cmd","nslookup","ping-cmd","ping","mtr-cmd","mtr","nmap-cmd","nmap",
  // Compression
  "zip-cmd","zip","unzip-cmd","unzip","tar-cmd","tar","gzip-cmd","gzip",
  // Media
  "ffmpeg-cmd","ffmpeg","convert-cmd","convert","screenshot","scrot",
  // Date/Time
  "timestamp","ts","date-iso","dateiso","date-unix","dateunix","epoch","epoch-to-date","now","datetime","utc","utc-time",
  // System
  "cpuinfo","lscpu","meminfo","lsmem","lsblk","block-devices","lspci","pci-devices","lsusb","usb-devices","hostname-cmd","hostname","whoami-cmd","whoami","uptime-cmd","uptime","cal-cmd","cal",
  // Users
  "users-cmd","users-list","w-cmd","w-users","last-cmd","last",
  // Services
  "systemctl-cmd","systemctl","services","list-services","crontab-cmd","crontab","cron","cron-jobs",
  // Package Managers
  "apt-cmd","apt","apt-list","apt-packages","brew-cmd","brew","pip-cmd","pip","pip-list","pip-freeze","cargo-cmd","cargo","go-cmd","go",
  // Basic
  "ls","cd","cat","pwd","mkdir","rm","touch","cp","mv","ln","tree",
  "grep","find","which","locate","rg","fd","bat","exa","eza","lf","yazi",
  "git","status","branches","graph","diff","log","commit","push","pull",
  "checkout","merge","rebase","stash","fetch","rebase","reset","restore",
  "ask","ai","opencode-ai","chatgpt","claude",
  "table","tree","chart","md","markdown","progress","jsonfmt",
  "git-status","git-branches","git-log","gitst","gitbr","gitlog",
  "docker-ps","docker-images","docker-stop-all","docker-rm-all","dps","di","dstop","drm",
  "k8s-pods","k8s-svc","k8s-nodes","kgp","kgs","kgn",
  "api","http","curl-json","db-query","db",
  "api-detect","api-scan","api-services","api-presets","api-service","api-preset",
  "api-graphql","gql","api-history","apih","api-fav","api-save","api-favs","api-favorites","api-run","apir",
  "s3-ls","s3-copy","s3cp","env-list","env-get","env-set","envls","secret-ls","secrets",
  "npm","yarn","pnpm","bun","npx","node",
  "pip","pipx","pip3","poetry","pipenv","conda","python","python3",
  "go","cargo","rustc","rustup",
  "apt","apt-get","dnf","yum","pacman","zypper","snap","flatpak",
  "brew","mas","winget","scoop","choco","pwsh","powershell",
  "pkg","apk","termux",
  "docker","podman","kubectl","helm","k9s","istio","terraform","ansible",
  "aws","gcloud","az","terraform","pulumi","serverless","sam",
  "ps","top","htop","btop","glances","kill","killall","pkill","bg","fg","jobs",
  "free","df","du","uptime","uname","hostname","whoami","id","who","w","last",
  "ping","curl","wget","ssh","scp","rsync","sftp","ftp","telnet","netcat",
  "dig","nslookup","host","traceroute","mtr","nmap","tcpdump","wireshark",
  "tar","zip","unzip","gzip","gunzip","bzip2","xz","7z","rar",
  "md5sum","sha256sum","sha512sum","base64","gpg","openssl","ssh-keygen",
  "chmod","chown","chgrp","umask","sudo","su","passwd",
  "systemctl","service","journalctl","dmesg","crontab","at","anacron",
  "pm2","forever","nodemon","supervisor","systemd",
  "code","vim","nano","emacs","subl","atom","zed","helix",
  "eslint","tsc","prettier","stylelint","biome","rome",
  "vite","webpack","rollup","esbuild","parcel","snowpack",
  "jest","vitest","mocha","pytest","unittest","rspec","minitest",
  "docker-compose","dockerfile","buildkit","buildah","kaniko",
  "journalctl","logwatch","prometheus","grafana","elk","splunk",
  "make","cmake","ninja","meson","gradle","maven","sbt",
  "cowsay","fortune","sl","cmatrix","neofetch","pfetch","screenfetch",
  "htop","btop","atop","bashtop","bpytop","glances","nmon",
  "tmux","screen","byobu","kitty","alacritty","terminus",
  "zsh","fish","bash","xonsh","powershell","pwsh",
  "starship","ohmyzsh","ohmyposh","powerlevel10k",
  "fzf","ripgrep","fd","bat","eza","exa","lsd","colorls",
  "httpie","curl","wget","axel","aria2","you-get","yt-dlp",
  "rclone","rsync","scp","sftp","filezilla",
  "mysql","mariadb","postgresql","sqlite","mongodb","redis","cockroachdb",
  "nginx","apache","caddy","traefik","haproxy","envoy",
  "systemctl","init","systemd","sysvinit","openrc","runit",
  "pass","bitwarden","1password","keepassxc","gopass","vault",
  "sops","age","gocryptfs","veracrypt","luks","dm-crypt",
  "git-crypt","sops","hashicorp vault","aws kms","gcp kms","azure keyvault",
  "act","nektos/act","github actions","gitlab ci","jenkins","circleci","travisci",
  "argocd","flux","tekton","spinnaker","screwdriver",
  "k9s","kwatch","kubenav","lens","octant","devspace",
  "skaffold","tilt","sloop","kubectl-debug","ksniff",
  "kompose","kopf","kubeval","datree","checkov","terrascan",
  "kustomize","helm","helmfile","argocd","flux",
  "prometheus","grafana","alertmanager","thanos","mimir",
  "loki","promtail","fluentd","fluent-bit","elasticsearch","logstash","kibana",
  "jaeger","zipkin","opentelemetry","skywalking","pinpoint",
  "istio","linkerd","envoy","nginx-ingress","traefik","contour",
  "calico","flannel","cilium","canal","weave","kube-router",
  "rook","longhorn","portworx","vsphere-csi","aws-ebs-csi",
  "vault","consul","etcd","zookeeper","eureka",
  "kafka","rabbitmq","activemq","pulsar","nats",
  "redis","memcached","aerospike","couchbase","cosmosdb","dynamodb",
  "mysql","mariadb","postgresql","postgres","cockroachdb","yugabytedb",
  "mongodb","cassandra","scylladb","couchdb","arangodb","neo4j",
  "clickhouse","duckdb","trino","presto","athena","bigquery","redshift",
  "snowflake","databricks","spark","flink","beam","dataflow",
  "airflow"," prefect","dagster","meltano","dbt","sqlmesh",
  "metabase","superset","redash","looker","tableau","powerbi",
  "jupyter","colab","zeppelin","noteable","deepnote","Observable",
  "rstudio","r","r renv","r pak","r tidyverse",
  "julia","jupyter-julia","Pkg","Pluto","IJulia",
  "lua","luajit","luarocks","neovim","vimspector",
  "rust-analyzer","rustfmt","clippy","cargo","rustup","rls",
  "gopls","gofmt","golint","staticcheck","golangci-lint","delve",
  "clang","gcc","g++","clang++","llvm","lldb","lld",
  "tsc","tsserver","typescript","deno","bun",
  "node","npm","yarn","pnpm","nvm","n","volta","fnm",
  "python","pip","pipenv","poetry","pyenv","uv","rye",
  "ruby","gem","bundler","rvm","rbenv","asdf",
  "php","composer","pecl","valet","laravel","symfony",
  "dotnet","nuget","msbuild","mono","xbuild",
  "java","maven","gradle","ant","kotlin","scala","groovy",
  "swift","xcode","swiftpm","carthage","cocoapods","swiftlint",
  "dart","flutter","pub","fvm","dart-analysis",
  "elixir","erlang","mix","hex","phoenix",
  "haskell","cabal","stack","ghc","hls",
  "fsharp","dotnet","fake","fake5","paket",
  "ocaml","opam","dune","merlin","reasonml",
  "clojure","deps","tools","lum","planck",
  "perl","cpan","carmel","perlbrew",
  "raku","rakudo","zef","p6doc",
  "zig","zls","zig build","zig fmt",
  "nim","nimble","choosenim","nimlangserver",
  "crystal","shards","crystal-play",
  "d","dub","dmd","ldc","gdc",
  "haxe","haxelib","haxe-position completion",
  "scala","sbt","ammonite","mill",
  "groovy","gradle","grails","vertx",
  "lua","luarocks","lapis","openresty",
  "r","rcmdcheck","rcpp","tidyverse","rstudio",
  "julia","Pkg","IJulia","Pluto","Juno",
  "coffeescript","coco","caffeine",
  "typescript","ts-node","tsc","ts-jest","ts-mocha",
  "svelte","svelte-kit","vite-svelte",
  "vue","nuxt","vite-vue","vue-cli",
  "angular","ng","nx","analog",
  "react","next","remix","gatsby","astro","astro",
  "solid","solid-start","solid-primitives",
  "qwik","qwik-city",
  "alpine","alpinejs","petite-vue",
  "lit","stencil","glimmer",
  "vanilla","htmx","unpoly",
  "ember","glimmer","ember-cli",
  "backbone","marionette","chaplin",
  "mithril","snabbdom","riot",
  "aurelia","dojo","cocoon",
  "extjs","sencha","kendo",
  "durandal","capsule","a1",
  "webcomponents","custom-elements","lit-html",
  "pwa","workbox","vite-pwa",
  "electron","tauri","neutralino","capacitor",
  "cordova","phonegap","ionic","quasar",
  "react-native","expo","react-native-web",
  "flutter","dart","fastlane","codemagic",
  "native-script","weex","uni-app",
  "kivy","beeWare","briefcase",
  "flet","pywebview","nicegui",
  "egui","iced","yew","dioxus",
  "tauri","wry","tauri-cli",
  "svelte-native","sveltejs-native-script",
  "nativescript","nativescript-vue",
  "deno","deno-deploy","fresh",
  "bun","bun.sh","oven-sh",
  "node","deno","bun","quickjs","xs",
  "vite","vitejs","vite-plugin","vite-node",
  "esbuild","swc","sucrase",
  "webpack","webpack-cli","webpack-dev-server",
  "rollup","rollup-plugin","tsup",
  "parcel","parcel-css","parcel-transformer",
  "snowpack","@snowpack/plugin",
  "astro","astrojs","astro-cli",
  "next","nextjs","next-auth","next-i18next",
  "nuxt","nuxtjs","nuxt-content","nuxt-ui",
  "remix","remix-run","remix-auth",
  "gatsby","gatsby-plugin","gatsby-image",
  "sveltekit","svelte-kit","sveltejs-kit",
  "solidstart","solid-js-start",
  "qwik","qwik-city","qwikloader",
  "storyblok","contentful","strapi","sanity",
  "prismic","keystatic"," TinaCMS",
  "directus","hasura","supabase","appwrite",
  "firebase","mongodb-atlas","realm",
  "pocketbase","nhost","convex",
  "grafbase","urql","houdini",
  "trpc","graphql-yoga","mercurius",
  "apollo","urql","relay","odata",
  "prisma","drizzle","kysely","query-anything",
  "typeorm","sequelize","mongoose","prisma-client",
  "mongo","mysql","postgres","sqlite","redis","elasticsearch",
  "auth0","clerk","kinde","supabase-auth","nextauth",
  "sendgrid","mailgun","postmark","ses","mailtrap",
  "stripe","paypal","braintree","razorpay",
  "twilio","nexmo","plivo","vonage",
  "cloudinary","imgix","sirv","unpic",
  "sentry","bugsnag","rollbar","logrocket","datadog",
  "newrelic","dd-trace","opentelemetry","honeybadger",
  "vercel","netlify","cloudflare","aws-amplify","render",
  "railway","fly","dokku","coolify","caprover",
  "heroku","dokku","porter","cycle",
  "docker","podman","containerd","cri-o","kaniko",
  "kubernetes","k8s","k3s","k3d","minikube","kind",
  "helm","helmfile","civo","gardener",
  "terraform","terragrunt","pulumi","cdk",
  "ansible","chef","puppet","salt","cloudinit",
  "vagrant","packer","vault","consul",
  "jenkins","gitlab-ci","github-actions","circleci","travis",
  "argocd","flux","spinnaker","codefresh",
  "prometheus","grafana","alertmanager","thanos",
  "loki","promtail","fluentd","elasticsearch","kibana",
  "jaeger","zipkin","opentelemetry","skywalking",
  "istio","linkerd","envoy","nginx","traefik",
  "rook","longhorn","portworx","minio",
  "vault","consul","etcd","zookeeper",
  "kafka","rabbitmq","redis","nats","pulsar",
  "mysql","postgres","mongo","cassandra","cockroachdb",
  "clear","exit","quit","q","x","bye",
  "help","?","man","info","whatis","apropos",
  "cmd","custom","snippet","bookmark","alias",
  "session","save","load","bookmark",
  "watch","monitor","log","tail","follow",
  "init","create","new","make","generate","gen",
  "install","i","add","remove","rm","delete","del","update","upgrade","up",
  "run","start","stop","restart","reload","serve","dev","build","test","lint",
  "format","fmt","beautify","minify","compress","optimize",
  "deploy","publish","release","push","pull","sync",
  "compile","build","bundle","pack","archive","extract",
  "check","validate","verify","test","audit","scan","inspect",
  "analyze","profile","benchmark","debug","trace","monitor",
  "list","ls","dir","ll","la","tree","find","search","query",
  "read","view","show","cat","head","tail","less","more",
  "write","edit","modify","update","patch","diff","change",
  "create","make","generate","scaffold","template","boilerplate",
  "delete","remove","destroy","drop","purge","clean",
  "copy","cp","clone","duplicate","backup","restore",
  "move","mv","rename","move","relocate",
  "download","get","fetch","pull","clone","grab",
  "upload","push","put","send","publish",
  "search","find","grep","rg","ag","ack","look","locate",
  "replace","substitute","swap","change","modify","update","sed","replace",
  "sort","order","arrange","organize","rank",
  "filter","select","choose","pick","extract","query",
  "aggregate","group","sum","count","avg","min","max",
  "join","merge","combine","union","intersect",
  "split","separate","divide","branch","fork",
  "export","import","convert","transform","map",
  "parse","decode","serialize","deserialize","encode",
  "compress","minify","uglify","obfuscate",
  "decompress","expand","prettify","beautify","format",
  "encrypt","hash","sign","verify","authenticate",
  "decrypt","decoded","unsign","verify","validate",
  "serve","host","listen","accept","connect",
  "client","request","get","post","put","patch","delete",
  "server","daemon","service","systemd","supervisor",
  "process","proc","pid","task","job","worker",
  "thread","coroutine","async","await","promise",
  "event","signal","hook","listener","handler",
  "stream","pipe","buffer","queue","stack",
  "cache","store","save","persist","keep",
  "session","cookie","token","credential","secret",
  "config","configure","setup","initialize","init",
  "environment","env","variable","var","const","let",
  "parameter","arg","argument","flag","option","switch",
  "flag","boolean","toggle","enable","disable","on","off",
  "status","state","health","ready","running","stopped","error","fail",
  "success","pass","ok","complete","done","finished",
  "pending","waiting","queued","scheduled","planned",
  "abort","cancel","stop","halt","kill","terminate",
  "retry","recover","restore","revert","undo","rollback",
  "upgrade","update","upgrade","migrate","transition",
  "downgrade","rollback","revert","undo",
  "version","ver","v","semver","release",
  "tag","label","mark","badge","flag","stamp",
  "branch","fork","clone","duplicate","copy",
  "merge","combine","unite","join","consolidate",
  "rebase","rewrite","redo","replay","reapply",
  "cherry-pick","select","choose","pick","take",
  "amend","modify","change","update","edit",
  "squash","compress","combine","merge","unite",
  "rebase","rewrite","reorganize","restructure",
  "stash","store","save","hide","temporarily",
  "pop","apply","restore","retrieve","get",
  "snapshot","checkpoint","savepoint","restore",
  "log","history","record","track","audit",
  "diff","compare","contrast","difference","delta",
  "patch","apply","create","generate","make",
  "blame","annotate","attribute","credit",
  "show","display","list","view","inspect","examine",
  "info","details","stats","statistics","metrics",
  "report","summary","overview","dashboard",
  "dashboard","monitor","dashboard","control",
  "console","terminal","shell","cli","tui","gui",
  "interface","ui","ux","view","presentation",
  "render","draw","display","show","present",
  "input","output","io","stdin","stdout","stderr",
  "stream","pipe","channel","connection",
  "buffer","cache","queue","pool","heap",
  "memory","ram","disk","storage","space",
  "cpu","processor","core","thread","worker",
  "network","internet","connection","link","bandwidth",
  "protocol","http","https","tcp","udp","websocket",
  "domain","host","server","client","endpoint",
  "url","uri","path","route","endpoint",
  "request","response","status","code","message",
  "header","metadata","content","body","payload",
  "format","type","mime","encoding","charset",
  "compression","encryption","authentication","authorization",
  "session","cookie","token","jwt","oauth",
  "ssl","tls","certificate","key","signature",
  "algorithm","cipher","hash","salt","pepper",
  "password","secret","credential","credential",
  "login","logout","signin","signout","register",
  "signup","subscribe","unsubscribe","join","leave",
  "user","account","profile","identity","role",
  "permission","access","privilege","right","grant",
  "role","admin","moderator","editor","viewer","guest",
  "group","team","organization","org","company",
  "project","repository","repo","codebase",
  "workspace","environment","setting","preference",
  "theme","style","appearance","look","feel",
  "font","color","icon","image","graphic","media",
  "animation","transition","effect","motion","interactive",
  "responsive","adaptive","accessible","a11y","i18n","l10n",
  "localization","internationalization","translation",
  "testing","testing","qa","quality","assurance",
  "unit","integration","e2e","end-to-end","functional",
  "performance","load","stress","security","penetration",
  "code-review","review","approval","merge","pull-request",
  "ci","cd","cicd","pipeline","workflow","action",
  "artifact","build","binary","executable","package",
  "dependency","package","library","framework","sdk",
  "module","component","service","microservice","function",
  "lambda","serverless","function-as-a-service",
  "container","docker","pod","kubernetes","k8s",
  "orchestration","deployment","scaling","monitoring",
  "logging","tracing","metrics","alerting","incident",
  "incident","alert","on-call","runbook","slo","slap",
];

function completer(line: string): [string[], string] {
  const hits = COMPLETIONS.filter(c => c.startsWith(line.toLowerCase()));
  return [hits.length ? hits : [], line];
}

rl.completer = completer;
function logo() {
  return chalk.red(`
██████╗ ███████╗██╗   ██╗███╗   ███╗ █████╗ ████████╗███████╗
██╔══██╗██╔════╝██║   ██║████╗ ████║██╔══██╗╚══██╔══╝██╔════╝
██║  ██║█████╗  ██║   ██║██╔████╔██║███████║   ██║   █████╗  
██║  ██║██╔══╝  ╚██╗ ██╔╝██║╚██╔╝██║██╔══██║   ██║   ██╔══╝  
██████╔╝███████╗ ╚████╔╝ ██║ ╚═╝ ██║██║  ██║   ██║   ███████╗
╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
`) + chalk.grey("         DevMate ") + chalk.white("v3.0") + chalk.grey(" | ") + chalk.black("Any Shell") + chalk.grey(" • ") + chalk.white("Any Command\n");
}


function help() {
  return `
${chalk.bold.cyan("╔══════════════════════════════════════════════════════════════════════════╗")}
${chalk.bold.cyan("║")}  ${chalk.bold.white("DevMate v3.0 - OMNI-SHELL")} ${chalk.gray("The Ultimate Cross-Platform CLI")}      ${chalk.bold.cyan("║")}
${chalk.bold.cyan("║")}  ${chalk.gray("Any Shell • Any Command • Any Platform • Any Device")}                ${chalk.bold.cyan("║")}
${chalk.bold.cyan("╚══════════════════════════════════════════════════════════════════════════╝")}

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("📁 FILE OPERATIONS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  ls [dir]           List files (ll, la, l)
  cd <dir>          Change directory
  cat <file>        View file
  pwd               Print working directory
  mkdir <dir>       Create directory
  rm <file|dir>     Remove file/directory
  touch <file>      Create empty file
  cp <src> <dest>   Copy file
  mv <src> <dest>   Move/rename file
  ln <src> <link>   Create symlink

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🔍 SEARCH & NAVIGATION")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  grep <pat> [f]    Search in files
  find <name>       Find files
  tree [dir]        Directory tree
  which <cmd>       Find command

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🔴 GIT & VERSION CONTROL")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  git <cmd>         Run git command
  status            Git status
  branches          List branches
  graph [n]         Commit graph
  diff              Show changes
  commit <msg>      Commit changes
  push              Push to remote
  pull              Pull from remote
  checkout          Switch branch

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("🤖 AI ASSISTANT")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  ask <question>    Ask AI
  ai <question>    Ask AI
  opencode-ai      Launch OpenCode AI

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("📦 JS/TS PACKAGE MANAGERS")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  npm <cmd>         Node Package Manager
  yarn <cmd>        Yarn Package Manager
  pnpm <cmd>        PNPM Package Manager
  bun <cmd>         Bun Runtime

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🐍 PYTHON PACKAGE MANAGERS")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  pip <pkg>         Pip package manager
  pipx <pkg>        Pipx CLI tools
  poetry <cmd>      Poetry manager
  conda <cmd>       Conda manager

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🐹 GO & 🦀 RUST")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  go <cmd>          Go language
  cargo <cmd>       Rust package manager

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🐧 LINUX PACKAGE MANAGERS")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  apt <cmd>         Debian/Ubuntu APT
  dnf <cmd>         Fedora/RHEL DNF
  pacman <cmd>      Arch Linux
  zypper <cmd>      OpenSUSE
  brew <cmd>        Homebrew (macOS/Linux)

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🎁 WINDOWS PACKAGE MANAGERS")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  winget <cmd>      Windows Package Manager
  scoop <cmd>       Scoop (Windows)
  choco <cmd>       Chocolatey (Windows)
  pwsh <cmd>        PowerShell

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("📱 ANDROID & iOS")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  progress 50 100    Progress bar
  jsonfmt <file>    Pretty print JSON

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🔧 GIT ENHANCEMENTS")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  git-status         Rich git status table
  git-branches       Branches with upstream
  git-log            Recent commits table
  gitst/gitbr        Shortcuts

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🐳 DOCKER & KUBERNETES")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  docker-ps/dps      Running containers table
  docker-images/di   Images table
  docker-stop-all    Stop all containers
  docker-rm-all      Remove all containers
  k8s-pods/kgp      Kubernetes pods
  k8s-svc/kgs       Kubernetes services  
  k8s-nodes/kgn     Kubernetes nodes

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🌐 SMART API CLIENT")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  api <method> <url>   HTTP client with JSON output
  api-detect           Scan for APIs in project
  api-services         List service presets
  api-service <svc>    Use preset API (github, stripe, etc)
  api-graphql/gql     GraphQL client
  api-history/apih    View request history
  api-fav <n> <u>     Save API as favorite
  api-favs            List favorites
  api-run <name>      Run saved favorite

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("🗄️ DATABASE EXPLORER")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  db <type> <query> Run SQL query
  db postgres <q>   PostgreSQL query
  db mysql <q>     MySQL query
  db sqlite <q>    SQLite query

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("☁️ CLOUD STORAGE")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  s3-ls             List S3 buckets
  s3-copy/s3cp      Copy to/from S3

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🔐 ENV & SECRETS")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  env-list/envls    List all env vars
  env-get <key>     Get env var
  env-set <key> <v> Set env var
  secret-ls/secrets List secrets/vault

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  fortune           Fortune cookie
  cowsay <text>    ASCII cow
  chess             Play chess
  2048             Play 2048

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("📡 SERVICES & DAEMONS")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  systemctl <cmd>   Systemd
  pm2 <cmd>         Node PM
  journalctl        System logs
  crontab -e       Edit crontab

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("💬 MESSAGING & SOCIAL")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  telegram <msg>      Send Telegram message
  telegram-file <f>   Send Telegram file
  discord <msg>      Send Discord message
  discord-webhook    Discord webhook
  slack <msg>        Send Slack message
  slack-webhook      Slack webhook
  whatsapp <msg>     Send WhatsApp message
  whatsapp-send      WhatsApp business
  messenger <msg>    Facebook Messenger
  facebook-post      Facebook post
  twitter-post <txt> Twitter/X post
  tiktok-post        TikTok upload
  telegram-bot       Telegram bot commands
  slack-bot          Slack bot
  discord-bot        Discord bot
  groupme <msg>      GroupMe message
  manychat <msg>    ManyChat bot
  discord-channel   Discord channel ops
  imessage           iMessage (macOS)
  sms                SMS via email

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🔵 GOOGLE ECOSYSTEM")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  gcloud <cmd>        Google Cloud CLI
  vertex <cmd>        Vertex AI
  firebase <cmd>      Firebase CLI
  flutter <cmd>       Flutter SDK
  dart <cmd>          Dart language
  gemini <prompt>     Gemini AI
  google-auth         Google Auth
  gsutil <cmd>        GCS utilities
  google-play        Google Play
  google-apps-script  GAS editor

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🤖 AI/ML PLATFORMS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  openai <prompt>       OpenAI GPT
  claude <prompt>      Anthropic Claude
  anthropic <prompt>   Claude API
  huggingface <model>  HuggingFace hub
  hf-inference         HF Inference API
  cohere <prompt>      Cohere AI
  anthropic-api        Claude API raw
  openrouter <prompt>  OpenRouter.ai
  replicate <model>   Replicate
  langchain <cmd>     LangChain CLI
  flowise             Flowise AI
  botpress <cmd>      Botpress
  datarobot <cmd>     DataRobot
  kimi <prompt>       Kimi AI (Moonshot)
  jules <prompt>      Jules AI
  bedrock <prompt>    AWS Bedrock
  together <prompt>   Together.ai
  perplexity <query>  Perplexity AI

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🐙 GITHUB INTEGRATION")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  gh <cmd>              GitHub CLI
  gh-run <action>       GitHub Actions run
  gh-workflow           Manage workflows
  gh-repo <cmd>         Repository ops
  gh-pr <cmd>           Pull requests
  gh-issue <cmd>        Issues management
  gh-release            Create release
  gh-hook <event>       Webhook triggers
  gh-secret             Secrets mgmt
  gh-deploy-key         Deploy keys
  gh pages              GitHub Pages
  gh-codespace          Codespaces
  gh-gist               Gists management

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("☁️ CLOUD STORAGE")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  dropbox <cmd>        Dropbox CLI
  onedrive <cmd>      OneDrive
  gdrive <cmd>        Google Drive
  box <cmd>           Box.com
  s3 <cmd>            AWS S3
  s3cp <src> <dst>    S3 copy
  s3ls                S3 list
  s3sync              S3 sync

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("📓 PRODUCTIVITY & NOTES")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  notion <cmd>         Notion API
  obsidian <cmd>      Obsidian vault
  evernote <cmd>      Evernote
  notion-db           Notion database
  notion-page         Notion page
  readwise <cmd>      Readwise
  logseq <cmd>        Logseq

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🍎 APPLE ECOSYSTEM")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  shortcuts <name>    iPhone Shortcuts
  apple-script       Run AppleScript
  automator <cmd>    Automator
  xcodebuild         Xcode build
  metal              Metal shaders
  swift <cmd>         Swift
  swiftui             SwiftUI
  spotlight          Spotlight search

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🖥️ IDE & EDITORS")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  cursor              Cursor IDE
  cursor-open         Open in Cursor
  code <file>         VS Code
  vscodium            VSCodium
  sublime <file>      Sublime Text
  jetbrains <ide>     JetBrains IDEs
  emacs <file>        Emacs
  helix <file>        Helix editor
  lapce <file>        Lapce
  zed <file>          Zed editor
  windsurf            Windsurf IDE

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🌐 WEB PLATFORMS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  wordpress <cmd>       WordPress CLI
  wp <cmd>             WP-CLI
  shopify <cmd>        Shopify CLI
  webflow <cmd>        Webflow
  framer <cmd>         Framer
  webhooks             Webhook management
  ngrok <port>         Public tunnels
  cloudflared <port>  Cloudflare tunnel
  tunnel <port>        Create tunnel
  localhost <port>     Expose local

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("⚡ REMOTE DEV & CLOUD IDE")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  replit <cmd>         Replit
  replit-cli           Replit CLI
  anydev               Any.dev
  codespaces           GitHub Codespaces
  gitpod               Gitpod
  gitlab-workspaces    GitLab Workspaces
  glab <cmd>           GitLab CLI
  jupyter             Jupyter
  colab               Google Colab
  kaggle              Kaggle
  binder              Binder

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("📱 MOBILE & CROSS-PLATFORM")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  expo <cmd>           Expo (React Native)
  react-native         React Native CLI
  cordova              Cordova
  ionic                Ionic
  capacitor            Capacitor
  flutter-build        Flutter build
  xcode-select         Xcode tools
  android-sdk          Android SDK
  adb <cmd>            Android Debug
  fastlane             Fastlane
  appcenter           MS App Center

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("☸️ K8S & ORCHESTRATION")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  kubectl <cmd>        Kubernetes
  k9s                 K9s dashboard
  helm <cmd>           Helm charts
  kustomize            Kustomize
  skaffold             Skaffold
  istio <cmd>          Istio
  envoy <cmd>          Envoy
  tekton <cmd>         Tekton
  argocd <cmd>         ArgoCD
  flux <cmd>           Flux CD

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🏗️ INFRA AS CODE")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  terraform <cmd>      Terraform
  terraforming         Import existing
  pulumi <cmd>         Pulumi
  ansible <cmd>        Ansible
  chef <cmd>           Chef
  puppet <cmd>         Puppet
  vagrant <cmd>        Vagrant
  packer <cmd>         Packer
  cdk <cmd>            AWS CDK
  cdk8s                CDK8s
  cdkube               CDK for K8s

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("📊 MONITORING & OBSERVABILITY")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  prometheus <cmd>     Prometheus
  grafana <cmd>        Grafana
  datadog <cmd>        Datadog
  newrelic <cmd>       New Relic
  sentry <cmd>         Sentry
  elastic <cmd>        Elasticsearch
  kibana               Kibana
  loki                 Grafana Loki
  tempo                Grafana Tempo
  jaeger               Jaeger
  opentelemetry        OpenTelemetry

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🔒 SECURITY & SECRETS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  vault <cmd>          HashiCorp Vault
  aws-secrets          AWS Secrets
  gcloud-secrets      GCP Secrets
  doppler <cmd>        Doppler
  bitwarden <cmd>      Bitwarden
  1password <cmd>     1Password
  age <file>          Age encryption
  sops                 SOPS
  trivy <image>        Container scan
  snyk <cmd>           Snyk
  dependabot           Dependabot

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("💻 EDGE & CLUSTERS")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  k3s <cmd>            K3s lightweight K8s
  k3d <cmd>            K3d K8s in Docker
  microk8s             MicroK8s
  minikube             Minikube
  kind                 K8s in Docker
  docker-swarm         Docker Swarm
  nomad <cmd>          Nomad
  consul <cmd>         Consul
  etcd <cmd>           etcd
  cilium               Cilium CNI

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("☁️ SERVERLESS & FUNCTIONS")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  aws-lambda           AWS Lambda
  google-functions     GCP Functions
  azure-functions      Azure Functions
  vercel <cmd>         Vercel
  netlify <cmd>        Netlify
  cloudflare-workers   CF Workers
  flyctl <cmd>         Fly.io
  railway <cmd>        Railway
  render <cmd>        Render
  heroku <cmd>        Heroku
  supabase <cmd>      Supabase
  firebase-functions   Firebase Functions

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🔌 PROTOCOLS & APIs")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  restic <cmd>         Restic backup
  restic-backup        Backup to repo
  restic-restore       Restore backup
  restic-snapshots    List snapshots
  restic-check        Check repo
  borg <cmd>           Borg backup
  rclone <cmd>         Rclone sync
  restic-init          Initialize repo

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("🎮 GAMING & STREAMS")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  steam <cmd>          Steam CLI
  epic <cmd>          Epic Games
  lutris              Lutris gaming
  gamemode            GameMode
  obs <cmd>           OBS Studio
  streamlabs          Streamlabs
  tauri <cmd>         Tauri apps

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🔧 DEVELOPMENT")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  run/dev/build/test  npm scripts
  lint/format       Code quality
  code/nano/vim     Editors
  eslint/tsc        Linters
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  run/dev/build/test  npm scripts
  lint/format       Code quality
  code/nano/vim     Editors
  eslint/tsc        Linters

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🔐 PERMISSIONS & USERS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  chmod/chown/chgrp Permissions
  sudo/su          Root access
  whoami/id/users  User info

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🎯 CUSTOM COMMANDS & SESSIONS")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  cmd add <n> <c>   Add custom command
  cmd list          List custom commands
  cmd del <n>       Delete custom command
  session save/load Sessions

  linear <cmd>         Linear issue tracking
  asana <cmd>          Asana tasks
  trello <cmd>         Trello boards
  jira <cmd>           Jira issues
  monday <cmd>         Monday.com

  langgraph             LangGraph CLI
  langchain             LangChain
  crewai                CrewAI
  autogen               AutoGen
  langroid              Langroid

  figma <cmd>          Figma CLI
  miro <cmd>            Miro boards
  excalidraw            Excalidraw

  postman <cmd>         Postman
  insomnia              Insomnia

  cypress <cmd>         Cypress
  playwright <cmd>      Playwright
  jest <cmd>            Jest

  mysql <cmd>           MySQL
  postgresql <cmd>      PostgreSQL
  mongosh <cmd>         MongoDB Shell
  redis <cmd>           Redis

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("⚡ ALIASES")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  ll/l/la          ls -la/ls -a
  g/gs/ga/gc/gp   git shortcuts
  d/dc             docker shortcuts
  k                kubectl

${chalk.gray("══════════════════════════════════════════════════════════════════════════")}
${chalk.gray("💡 Tips: !<cmd> for shell, Tab autocomplete, 'cheatsheet' for 700+ commands")}
${chalk.gray("══════════════════════════════════════════════════════════════════════════")}
`;
}

function getVersion() {
  return "3.0.0";
}

function extendedHelp() {
  return `
${chalk.bold.cyan("╔══════════════════════════════════════════════════════════════════════════╗")}
${chalk.bold.cyan("║")}  ${chalk.bold.white("DevMate v3.0 - OMNI-SHELL")} ${chalk.gray("- EXTENDED COMMAND LIST")}            ${chalk.bold.cyan("║")}
${chalk.bold.cyan("║")}  ${chalk.gray("700+ Commands for Every Use Case")}                                   ${chalk.bold.cyan("║")}
${chalk.bold.cyan("╚══════════════════════════════════════════════════════════════════════════╝")}

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("📁 FILE OPERATIONS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  ls [opts] [dir]      List files (ls, ll, la, l, llh, lt, lS, lR)
  cd <dir>             Change directory (cd, cd-, cd~, pushd)
  pwd                  Print working directory (pwd, pwdi, pwdL)
  cat <file>           View file (cat, tac, head, tail, less, more)
  mkdir <dir>          Create directory (mkdir, mkdirp, md)
  rm <file>            Remove (rm, rmdir, rimraf, unlink, del)
  cp <src> <dest>      Copy (cp, copy, cpi, rsync)
  mv <src> <dest>      Move (mv, move, mi, ren)
  ln <src> <link>      Symlink (ln, ln -s, link, symlink)
  touch <file>         Create empty file (touch, toucha, mkfile)
  chmod <perms> <f>    Change permissions (chmod, chown, chgrp)
  find <path> <opts>   Find files (find, fd, fdfind, locate, mlocate)
  grep <pat> [files]   Search (grep, ag, rg, ack, ugrep, git grep)
  tree [dir]           Directory tree (tree, exa --tree, lsd --tree)
  wc <file>            Word count (wc, wc -l, wc -w, wc -c)
  du <dir>             Disk usage (du, dust, ncdu, diskus)
  df -h                Disk free (df, pydf, di)
  stat <file>          File details (stat, statx, file, identify)
  diff <f1> <f2>       Compare files (diff, diff3, sdiff, vimdiff)
  sort <file>          Sort lines (sort, shuf, uniq, sort -r)
  cut <file>           Cut columns (cut, awk, sed, colrm)
  tee <file>           Read from stdin (tee, sponge, script)

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🔍 SEARCH & NAVIGATION")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  which <cmd>          Find command (which, whereis, type, command -v)
  whereis <cmd>       Locate binary/source (whereis, apropos, man -k)
  fzf [path]          Fuzzy finder (fzf, fzf --preview, sk)
  rg <pat>            Ripgrep (rg, rg -l, rg -n, rg -v, rg -w)
  ag <pat>            Silver searcher (ag, ag -l, ag -g, ag -i)
  fd <name>           Find files (fd, fdfind, find -name)
  locate <name>       Locate files (locate, updatedb, mlocate)
  history             Command history (history, fc, r, !$, !!)
  alias               List aliases (alias, unalias, type)
  compgen             Completion candidates (compgen -a, compgen -c)

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🔴 GIT & VERSION CONTROL")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  git <cmd>           Git SCM (git, gh, glab, gitk, tig)
  git init            Initialize repo (git init, git init --bare)
  git clone <url>    Clone repository (git clone, gh repo clone)
  git add <files>    Stage files (git add, git add -A, git add -p)
  git commit <msg>   Commit changes (git commit, git commit -m, git commit -am)
  git push            Push to remote (git push, gp, git push -u)
  git pull            Pull from remote (git pull, gl, git pull --rebase)
  git fetch           Fetch changes (git fetch, git fetch --all)
  git status          Show status (git status, gst, gs, git status -s)
  git log             Commit history (git log, glog, git log --oneline)
  git diff            Show changes (git diff, gd, git diff --staged)
  git branch          List branches (git branch, br, git branch -a)
  git checkout        Switch branch (git checkout, gco, git switch)
  git merge           Merge branches (git merge, git merge --no-ff)
  git rebase          Rebase (git rebase, git rebase -i, grb)
  git stash           Stash changes (git stash, gstash, git stash pop)
  git reset           Reset HEAD (git reset, git reset --hard, git reset --soft)
  git revert          Revert commit (git revert, git revert -n)
  git cherry-pick    Cherry-pick (git cherry-pick, gcp)
  git tag             Tag commit (git tag, git tag -a, git push --tags)
  git submodule       Submodules (git submodule, git submodule update)
  git worktree       Worktrees (git worktree, git worktree add)
  gh <cmd>           GitHub CLI (gh, gh repo, gh pr, gh issue, gh run)
  glab <cmd>         GitLab CLI (glab, glab mr, glab issue)
  gitk                Git GUI (gitk, git gui, gitg)

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("🐳 DOCKER & CONTAINERS")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  docker <cmd>        Container runtime (docker, dockerd, podman, containerd)
  docker ps           List containers (docker ps, docker ps -a, dps, dpa)
  docker images       List images (docker images, di, docker images -a)
  docker run <img>    Run container (docker run, docker run -d, dcr)
  docker exec <id>    Execute in container (docker exec -it, dex, de)
  docker logs <id>    Container logs (docker logs, dlog, docker logs -f)
  docker build <path> Build image (docker build, docker build -t)
  docker pull <img>   Pull image (docker pull, docker pull -a)
  docker push <img>  Push image (docker push, docker push -a)
  docker stop <id>   Stop container (docker stop, docker kill)
  docker rm <id>      Remove container (docker rm, docker rm -f)
  docker rmi <img>    Remove image (docker rmi, docker rmi -f)
  docker network      Networks (docker network ls, docker network inspect)
  docker volume       Volumes (docker volume ls, docker volume create)
  docker-compose      Compose (docker-compose, docker compose, dcp)
  docker swarm        Swarm (docker swarm init, docker stack deploy)
  kubectl <cmd>       K8s CLI (kubectl, k, kubectx, kubens)
  k9s                 Terminal K8s (k9s, k9s -c, k9s --readonly)
  kind                K8s in Docker (kind, kind create cluster)
  minikube            Local K8s (minikube, minikube start, minikube dashboard)
  helm                K8s charts (helm, helm install, helm upgrade)
  kustomize           K8s config (kustomize, kubectl apply -k)
  skaffold            K8s dev (skaffold, skaffold dev, skaffold debug)
  nerdctl             Containerd CLI (nerdctl, nerdctl ps, nerdctl build)
  crictl              CRI tools (crictl, crictl ps, crictl logs)
  podman              Podman (podman, podman build, podman run)
  buildah             Buildah (buildah, buildah bud, buildah from)
  skopeo              Skopeo (skopeo, skopeo copy, skopeo inspect)
  crane               Crane (crane, crane pull, crane push)

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("☁️ CLOUD & DEVOPS")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  aws <svc>           AWS CLI (aws, awscli, awless, eksctl)
  gcloud <cmd>       GCP CLI (gcloud, gsutil, bq, gcloud init)
  azure <cmd>        Azure CLI (az, azure-cli, azurerm)
  terraform <cmd>    IaC (terraform, tf, terragrunt, tfsec)
  ansible <cmd>      Config mgmt (ansible, ansible-playbook, ansible-vault)
  pulumi <cmd>       IaC (pulumi, puluictl, tf2pulumi)
  serverless         Serverless (serverless, sls, serverless deploy)
  awscli <cmd>       AWS v2 (aws, aws-vault, awsume)
  cdk <cmd>          CloudFormation (cdk, cdk init, cdk deploy)
  SAM <cmd>          SAM CLI (sam, sam build, sam deploy)
  doctl              DigitalOcean (doctl, doctl compute)
  linode-cli         Linode (linode-cli, linode-cli nodebalancers)
  flyctl             Fly.io (flyctl, fly launch, fly deploy)
  wrangler           Cloudflare (wrangler, wrangler publish)
  netlify <cmd>      Netlify (netlify, netlify deploy, ntl)
  vercel <cmd>       Vercel (vercel, vercel deploy, vc)
  terraforming       AWS tf (terraforming, terraforming aws)
  terragrunt <cmd>   Terragrunt (terragrunt, tg, terragrunt apply)

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🤖 AI & MACHINE LEARNING")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  openai <prompt>    OpenAI (openai, openai api, openai fine-tune)
  Claude <prompt>   Anthropic Claude (claude, claude-cli, anthropic)
  Gemini <prompt>   Google Gemini (gemini, bard, aistudio)
  Ollama <model>    Local LLMs (ollama, ollama run, llama.cpp)
  huggingface       HuggingFace (huggingface-cli, huggingface_hub)
  langchain         LangChain (langchain, langserve)
  pytorch           PyTorch (python -m torch, pt, torch)
  tensorflow        TensorFlow (python -m tensorflow, tf, tf-agents)
  keras             Keras (python -m keras, keras)
  scikit-learn      SciKit (python -m sklearn, sklearn)
  jupyter           Jupyter (jupyter, jupyter-lab, notebook)
  colab             Google Colab (colab, colaboratory)
  mlflow            MLflow (mlflow, mlflow server, mlflow ui)
  wandb             Weights & Biases (wandb, wandb login)
  fastai            FastAI (fastai, fastai.launch)
  transformers      HF Transf. (transformers, huggingface_hub)
  pandas            Data analysis (pandas, pd, python -m pandas)
  numpy             NumPy (numpy, np, python -m numpy)
  scipy             SciPy (scipy, python -m scipy)
  matplotlib        Plotting (matplotlib, plt, python -m matplotlib)
  seaborn           Seaborn (seaborn, python -m seaborn)
  plotly            Plotly (plotly, python -m plotly)
  r                  R language (R, Rscript, rstudio)
  rstudio           RStudio (rstudio, rstudio-server)
  julia             Julia (julia, julia -e, jupyter)
  octave            Octave (octave, octave-cli)
  spark             Apache Spark (spark-submit, pyspark, spark-shell)

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🐍 PYTHON ECOSYSTEM")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  python             Python (python, python3, python3.11, python3.12)
  pip <cmd>          Package installer (pip, pip3, pipx)
  pip install <pkg>  Install package (pip install, pipi, pip install -e)
  pip list           List packages (pip list, pip freeze, pip check)
  pipenv             Pipenv (pipenv, pipenv install, pipenv shell)
  poetry             Poetry (poetry, poetry add, poetry install)
  conda              Conda (conda, conda install, mamba)
  pyenv              Python versions (pyenv, pyenv install, pyenv global)
  virtualenv         Virtual envs (virtualenv, python -m venv)
  pipx               CLI tools (pipx, pipx install, pipx run)
  pyproject          PyProject (python -m pyproject, maturin)
  setuptools         Setuptools (python -m setuptools, build)
  twine              PyPI upload (twine, twine upload, flit)
  pytest             Testing (pytest, py.test, pytest -v)
  tox                Testing (tox, tox -e)
  mypy               Type checking (mypy, python -m mypy)
  black              Formatting (black, python -m black)
  flake8             Linting (flake8, python -m flake8)
  pylint             Linting (pylint, python -m pylint)
  ruff               Linting (ruff, ruff check, ruff format)
  isort              Import sort (isort, python -m isort)
  coverage           Coverage (coverage, coverage html)

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🐙 JAVASCRIPT & TYPESCRIPT")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  npm <cmd>           Package manager (npm, npx, nvm)
  node <file>         Node.js (node, node -e, node --watch)
  nvm                 Node version (nvm, nvm use, nvm install)
  npx <pkg>           Run packages (npx, npx -y, npx tsc)
  yarn <cmd>          Yarn (yarn, yarn add, yarndlx)
  pnpm <cmd>          PNPM (pnpm, pnpm add, pnpm dlx)
  bun                 Bun runtime (bun, bun install, bun run)
  deno                Deno (deno, deno run, deno bundle)
  ts-node             TypeScript (ts-node, tsx, tsx watch)
  tsc                 TypeScript compiler (tsc, tsc --watch, tsc --noEmit)
  esbuild             Bundler (esbuild, esbuild bundle)
  vite                Vite (vite, vite build, vite preview)
  webpack             Webpack (webpack, webpack-cli, webpack-dev-server)
  parcel              Parcel (parcel, parcel build)
  rollup              Rollup (rollup, rollup -c)
  astro               Astro (astro, astro dev, astro build)
  next                Next.js (next, next dev, next build)
  nuxt                Nuxt.js (nuxt, nuxt dev, nuxt build)
  svelte              Svelte (svelte, svelte-kit, vite-plugin-svelte)
  remix               Remix (remix, remix dev, remix build)
  qwik                Qwik (qwik, qwik dev, qwik build)
  solid               SolidJS (solid, solid-start, vinxi)
  react               React (create-react-app, vite, next)
  vue                 Vue.js (vue, vue create, nuxt)
  angular             Angular (ng, ng new, ng build)
  nest                NestJS (nest, nest new, nest generate)
  electron            Electron (electron, electron-forge)
  NW.js               NW.js (nw, nwjs)
  tauri               Tauri (tauri, tauri dev, tauri build)

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🦀 RUST ECOSYSTEM")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  cargo <cmd>         Package manager (cargo, cargo install)
  rustc               Compiler (rustc, rustc --edition)
  rustup              Toolchain (rustup, rustup default, rustup update)
  rustc --version     Rust version (rustc, rustc -V, rustc --print)
  clippy              Linter (cargo clippy, clippy-driver)
  rustfmt             Formatter (rustfmt, cargo fmt)
  cargo build         Build (cargo build, cargo b, cargo build --release)
  cargo test          Tests (cargo test, cargo t, cargo test --lib)
  cargo run           Run (cargo run, cargo r, cargo run --example)
  cargo doc           Docs (cargo doc, cargo doc --open)
  cargo add <dep>     Add dependency (cargo add, cargo remove)
  cargo new <name>    New project (cargo new, cargo init)
  cargo check         Check (cargo check, cargo clippy)
  cargo publish       Publish (cargo publish, cargo package)
  cargo tree          Dependency tree (cargo tree, cargo tree -i)
  cargo update        Update deps (cargo update, cargo update -p)
  wasm-pack           WASM (wasm-pack, wasm-pack build)
  cargo-criterion     Benchmarking (cargo criterion, cargo bench)
  cargo-make          Task runner (cargo-make, maker)

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("🅰️ GO ECOSYSTEM")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  go <cmd>            Go (go, go run, go build)
  go mod <cmd>       Modules (go mod init, go mod tidy, go mod download)
  go get <pkg>       Get packages (go get, go install)
  go test             Tests (go test, go test -v, go test -cover)
  go build            Build (go build, go build -o)
  go run <file>       Run (go run, go run .)
  gofmt              Format (gofmt, gofmt -w, gofmt -d)
  golint             Linter (golint, golint ./...)
  go vet              Checker (go vet, go vet ./...)
  staticcheck        Static analysis (staticcheck, go-staticcheck)
  goreleaser        Release (goreleaser, goreleaser release)
  delve              Debugger (dlv, dlv debug)
  gops               Go process (gops, gops stats)
  go-modiff          Diff tool (go-modiff, go-modiff -v)
  richgo             Rich test output (richgo, richgo test)
  gocritic           Critique (gocritic, gocritic check)
  stringer           String gen (stringer, go generate)
  mockgen            Mocking (mockgen, go install github.com/mockery)

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("☕ JAVA & JVM")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  java <file>         Java (java, java -jar, openjdk)
  javac <file>       Compile (javac, java -c)
  gradle <task>      Gradle (gradle, gradlew, gradle wrapper)
  mvn <goal>         Maven (mvn, mvnw, mvn clean install)
  scala              Scala (scala, scala-cli, amm)
  kotlin <file>      Kotlin (kotlin, kotlinc, kscript)
  groovy              Groovy (groovy, groovysh, groovy -e)
  clojure            Clojure (clojure, clj, leiningen)
  jshell             JShell (jshell, jshell --class-path)
  jbang              JBang (jbang, jbang init, jbang run)
  ant                Ant (ant, ant -f)
  sbt                Scala Build (sbt, sbt compile)
  kotlinc            KotlinC (kotlinc, kotlinc -script)
  jar                 JAR (jar, jar cf, jar xf)
  jcmd               JCMD (jcmd, jcmd -l)
  jmap                Heap dump (jmap, jmap -heap)
  jstack             Thread dump (jstack, jstack -l)
  jconsole           JConsole (jconsole, jvisualvm)
  lombok             Lombok (lombok, lombok delombok)

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("📱 MOBILE DEVELOPMENT")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  flutter <cmd>      Flutter (flutter, flutter create, flutter run)
  dart <file>        Dart (dart, dart run, dart compile)
  fvm                Flutter versions (fvm, fvm install, fvm use)
  xcodebuild         Xcode build (xcodebuild, xcode-select)
  fastlane           CI/CD (fastlane, fastlane ios, fastlane android)
  ionic              Ionic (ionic, ionic start, ionic build)
  capacitor          Capacitor (capacitor, capacitor add, capacitor sync)
  cordova            Cordova (cordova, cordova create, cordova build)
  expo               Expo (expo, expo start, expo run:ios)
  react-native       RN (react-native, react-native init)
  native-run         Native run (native-run, native-run android)
  xcrun              Xcode run (xcrun, xcrun simctl)
  androidsdk         Android SDK (sdkmanager, adb, avdmanager)

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("💬 MESSAGING & COMMUNICATION")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  telegram           Telegram (telegram-cli, tdcli, telegram-bot)
  discord            Discord (discord, discord.js, discord.py)
  slack              Slack (slack, slack-cli, Incoming Webhooks)
  whatsapp           WhatsApp (whatsapp-web.js, venom-bot)
  signal             Signal (signal-cli, signal-proxy)
  irc                IRC (irssi, hexchat, weechat, epic)
  matrix             Matrix (element, matrix-commander)
  zulip              Zulip (zulip, zulip-cli)
  keybase            KeyBase (keybase, keybase chat)
  rocket             Rocket.Chat (rocket, rocket-cli)
  mattermost         Mattermost (mattermost, mmctl)
  teams              MS Teams (teams, msteams-cli)
  zoom               Zoom (zoom, zoomuscli)
  discord-webhook   Discord webhook (discord, send-discord)

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🔐 SECURITY & PENETRATION TESTING")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  nmap <target>      Network scanner (nmap, nmap -sV, zenmap)
  metasploit         Metasploit (msfconsole, msfvenom, msfdb)
  hydra              Password cracker (hydra, hydra -L, hydra -P)
  john               John (john, john --wordlist)
  hashcat            Hashcat (hashcat, hashcat -m, hashcat -a)
  aircrack-ng        WiFi (aircrack-ng, airmon-ng, airodump-ng)
  wireshark          Packet analyzer (wireshark, tshark, dumpcap)
  nikto              Web scanner (nikto, nikto -h)
  sqlmap             SQL injection (sqlmap, sqlmap -u)
  burp               Burp Suite (burpsuite, burp-rest-proxy)
  zap                OWASP ZAP (zaproxy, zap-cli)
  netcat             Netcat (nc, ncat, socat)
  tcpdump            Packet capture (tcpdump, tcpdump -i)
  ettercap           Ettercap (ettercap, ettercap -T)
  responder          LLMNR (responder, python3 Responder.py)
  crackmapexec       CME (crackmapexec, cme)
  BloodHound         AD analysis (bloodhound, python3 bloodhound.py)
  empire             C2 (empire, python3 empire.py)
  cobalt-strike      Cobalt Strike (cobalt-strike, ./teamserver)
  nuclei             Vulnerability scanner (nuclei, nuclei -t)
  zaproxy            ZAP (zaproxy, zap-baseline)

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🕵️ FORENSICS & INCIDENT RESPONSE")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  autopsy            Autopsy (autopsy, autopsy -h)
  volatility         Volatility (volatility, volatility3)
  sleuthkit          SleuthKit (tsk_gettimes, icat, fls)
  binwalk            Binwalk (binwalk, binwalk -e)
  foremost           Foremost (foremost, foremost -v)
  strings            Strings (strings, strings -n)
  exiftool           EXIF (exiftool, exiftool -r)
  steghide           Steghide (steghide, steghide extract)
  xxd                Hex dump (xxd, xxd -r, hexdump)
  radare2            R2 (r2, radare2, rizin)
  ghidra             Ghidra (ghidra, analyzeHeadless)
  ida                IDA Pro (ida64, idat64)
  cutter             Cutter (cutter, cutter -r)
  volatility3        Vol3 (volatility3, python3 -m volatility3)
  grep               Log grep (grep, grep -E, rg)

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("🗄️ DATABASES")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  psql               PostgreSQL (psql, pg_isready, pg_dump)
  mysql              MySQL (mysql, mysqldump, mysql_install_db)
  mongosh            MongoDB (mongosh, mongo, mongod)
  redis-cli          Redis (redis-cli, redis-server, redis-cli ping)
  sqlite3            SQLite (sqlite3, sqlitebrowser)
  psql -c <cmd>     Run command (psql -c, psql -f)
  mongod             Mongo daemon (mongod, mongod --dbpath)
  redis-server       Redis daemon (redis-server, redis-server --daemonize)
  pg_dump            Backup (pg_dump, pg_dumpall, pg_restore)
  mysqldump          Backup (mysqldump, mysqldump --single-transaction)
  couchdb            CouchDB (couchdb, couchjs)
  influx             InfluxDB (influx, influxd)
  cockroach          CockroachDB (cockroach, cockroach sql)
  neo4j              Neo4j (neo4j, cypher-shell)
  orientdb           OrientDB (orientdb, console.sh)
  timescaledb        TimescaleDB (timescaledb, psql)
  pulsar             Pulsar (pulsar, pulsar-admin)
  clickhouse         ClickHouse (clickhouse, clickhouse-client)

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("📡 APIs & WEB SERVICES")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  curl <url>         HTTP client (curl, curl -X, httpie)
  httpie             HTTPie (http, httpie, ht)
  wget <url>         Download (wget, wget -r, curl -O)
  postman            Postman (postman, newman)
  insomnia           Insomnia (insomnia, insomnia-cli)
  swagger            Swagger (swagger, swagger-codegen)
  http <method>      HTTP (httpie, h)
  ab                 Apache Bench (ab, ab -n, ab -c)
  wrk                WRK (wrk, wrk -t, wrk -c)
  hey                Hey (hey, hey -n)
  k6                 K6 load test (k6, k6 run, k6 archive)
  locust             Locust (locust, locust -f)
  httpx              HTTPX (httpx, python -m httpx)
  http-server        HTTP server (http-server, serve, python -m http.server)
  insomnia           Insomnia (insomnia, insomnia export)
  jq                 JSON processor (jq, jq '.', python -m json.tool)

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🔗 BLOCKCHAIN & WEB3")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  solana             Solana (solana, solana-keygen, solana-program)
  ethereum           Ethereum (geth, parity, eth)
  ethers             ethers.js (ethers, npx ethers)
  web3               Web3.js (web3, web3.js)
  hardhat            Hardhat (hardhat, npx hardhat)
  truffle            Truffle (truffle, truffle compile)
  wagmi              Wagmi (wagmi, viem)
  etherscan          Etherscan (etherscan, eth-tx-scanner)
  ethers             ethers-v5/6 (ethers, @ethersproject)
  web3j              Web3j (web3j, web3j CLI)
  candide            Candide (candide, od)
  starknet           StarkNet (starknet, starknet-compile)
  aztec              Aztec (aztec, aztec-up)
  polygon            Polygon (polygon, matic)
  arbitrum           Arbitrum (arbitrum, arb)
  optimism           Optimism (optimism, op-node)
  near               NEAR (near, near-cli)
  cosmos             Cosmos (cosmos, gaiad)
  terra              Terra (terra, terrad)
  avalanche          Avalanche (avalanche, avax)

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🏠 HOME AUTOMATION & IOT")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  homeassistant     Home Assistant (hass, homeassistant, ha)
  homekit           HomeKit (homekit, hap-server)
  google-home       Google Home (google-home, ghass)
  alexa             Alexa (alexa, alexa-cli)
  zigbee2mqtt       Zigbee2MQTT (zigbee2mqtt, mqtt)
  mqtt              MQTT (mosquitto, mqtt-cli, mqtt.js)
  mosquitto         MQTT broker (mosquitto, mosquitto_sub)
  node-red          Node-RED (node-red, node-red-admin)
  esphome           ESPHome (esphome, esphome config)
  tasmota           Tasmota (tasmota, sonoff)
  zigbee            Zigbee (zigbee2mqtt, zha-network)
  zwave             Z-Wave (openzwave, zwavejs2mqtt)
  philips-hue       Hue (philips-hue-cli, hue-cli)
  ikea-trådfri     IKEA (tradfri, ikea-tradfri)
  Tuya              Tuya (tuya-cli, localtuya)
  Shelly            Shelly (shelly, shelly-cli)

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🤖 ROBOTICS & ROS")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  roscore            ROS core (roscore, roscore)
  roslaunch          Launch (roslaunch, roslaunch file.launch)
  rosrun             Run (rosrun, rosrun pkg node)
  rosservice         Services (rosservice, rosservice list)
  rostopic           Topics (rostopic, rostopic echo)
  rosnode            Nodes (rosnode, rosnode list)
  rosparam           Params (rosparam, rosparam set)
  catkin_make       Catkin (catkin_make, catkin build)
  colcon             Colcon (colcon, colcon build)
  arduino            Arduino (arduino, arduino-cli)
  platformio         PlatformIO (platformio, pio)
  micropython        MicroPython (micropython, mpremote)
  esp-idf            ESP-IDF (esp-idf, idf.py)
  esptool            ESPTool (esptool, esptool.py)
  stm32cubeprog      STM32 (STM32CubeProgrammer, st-flash)
  ros2               ROS2 (ros2, ros2 daemon, ros2 pkg)

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🎨 MEDIA & DESIGN")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  ffmpeg             Video/audio (ffmpeg, ffprobe, ffplay)
  imagemagick        ImageMagick (convert, identify, mogrify)
  gimp               GIMP (gimp, gimp-2.99)
  inkscape           Inkscape (inkscape, inkscape --export)
  blender            Blender (blender, blender -b)
  krita               Krita (krita, krita.exe)
  scribus            Scribus (scribus, scribus -no-svg)
  darktable          Darktable (darktable, darktable-cli)
  rawtherapee       RawTherapee (rawtherapee, rt)
  handbrake         HandBrake (handbrake, handbrake-cli)
  imagemagick        Image tools (magick, identify, compare)
  sox                Audio (sox, sox effect)
  audacity           Audacity (audacity, audacity.exe)
  lmms               LMMS (lmms, lmms studio)
  hydrogen           Hydrogen (hydrogen, hydrogen.bin)
  openfx             OpenFX (ofr, ofx)
  obs                OBS (obs-cli, obs-ffmpeg)
  vlc                VLC (vlc, cvlc, vlc-wrapper)
  youtube-dl         YouTube (yt-dlp, youtube-dl)
  streamlink         Streamlink (streamlink, streamlink-cli)

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("📊 DATA ENGINEERING")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  spark              Spark (spark-submit, pyspark, spark-shell)
  airflow            Airflow (airflow, airflow dags)
  dagster            Dagster (dagster, dagit)
  kafka              Kafka (kafka-topics, kafka-console-producer)
  flink              Flink (flink, flink run)
  beam               Beam (beam, beam-runner)
  databricks         Databricks (databricks, dbconnect)
  dbt                DBT (dbt, dbt run, dbt test)
  dbtable            DBTable (dbtable, python -m dbtable)
  trino              Trino (trino, trino-cli)
  presto             Presto (presto, presto-cli)
  hive               Hive (hive, beeline)
  sqoop              Sqoop (sqoop, sqoop-import)
  flume              Flume (flume-ng, flume-env)
  nifi               NiFi (nifi, nifi.sh)
  kafka-connect      Kafka Connect (kafka-connect, connect-distributed)
  debezium           Debezium (debezium, connect-distributed)

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("📈 MONITORING & OBSERVABILITY")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  prometheus         Prometheus (prometheus, promtool)
  grafana            Grafana (grafana, grafana-cli)
  alertmanager       Alertmanager (alertmanager, amtool)
  thanos             Thanos (thanos, thanos query)
  loki               Loki (loki, logcli)
  elastic            Elasticsearch (elasticsearch, es)
  kibana             Kibana (kibana, kibana-keystore)
  jaeger             Jaeger (jaeger, jaeger-all-in-one)
  zipkin             Zipkin (zipkin, zipkin-all-in-one)
  tempo              Grafana Tempo (tempo, tempo-query)
  cortex             Cortex (cortex, cortextool)
  thanos             Thanos (thanos, thanos receive)
  telegraf           Telegraf (telegraf, telegraf --test)
  fluentd            Fluentd (fluentd, fluent-bit)
  sentry             Sentry (sentry-cli, sentry-python)
  newrelic          New Relic (newrelic, newrelic-admin)
  datadog            Datadog (datadog, ddtrace)
  honeycomb          Honeycomb (honeycomb, honeycomb-cli)

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🛠️ SYSTEM ADMINISTRATION")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  systemctl         Systemd (systemctl, systemd, init)
  service           SysV init (service, chkconfig, update-rc.d)
  journalctl        Logs (journalctl, journalctl -u, journalctl -f)
  ps                Processes (ps, ps aux, pgrep, pkill)
  top                Top (top, htop, atop, bt)
  htop              Interactive (htop, htop -d)
  sar               Sysstat (sar, sadf, iostat)
  iotop             I/O top (iotop, iotop -o)
  iftop             Net top (iftop, nethogs)
  netstat           Netstat (netstat, ss, lsof)
  iptables          Firewall (iptables, iptables -L, ufw)
  firewalld         Firewall (firewalld, firewall-cmd)
  nft               Nftables (nft, nft list rules)
  ip                IP (ip, ip addr, ip link)
  route             Routing (route, ip route)
  dig               DNS (dig, nslookup, host)
  ping              Ping (ping, ping6, fping, hping3)
  traceroute        Trace (traceroute, tracepath, mtr)
  nmap              Port scan (nmap, nmap -sT, zenmap)
  ssh               SSH (ssh, ssh-keygen, scp, sftp)
  scp               Secure copy (scp, rsync, scp -r)
  sftp              SFTP (sftp, lftp, ncftp)
  tmux              Terminal multiplexer (tmux, tmuxinator)
  screen            Screen (screen, screen -r)
  byobu             Byobu (byobu, byobu-tmux)
  sudo              Sudo (sudo, sudo -i, sudo -s)
  useradd           Users (useradd, usermod, userdel, groups)
  crontab           Cron (crontab, crontab -e, cron)

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("📦 PACKAGE MANAGERS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  apt               Debian/Ubuntu (apt, apt-get, apt-cache)
  dnf               Fedora/RHEL (dnf, dnf search, dnf install)
  pacman            Arch Linux (pacman, pacman -S, yay, aur)
  brew              Homebrew (brew, brew install, brew cask)
  snap              Snap (snap, snap install, snapd)
  flatpak           Flatpak (flatpak, flatpak install, flatpak run)
  choco             Chocolatey (choco, choco install)
  scoop             Windows (scoop, scoop install, scoop bucket)
  winget            Windows (winget, winget install)
  pipx              pipx (pipx, pipx install, pipx run)
  gem               Ruby gems (gem, gem install, bundler)
  cargo             Rust (cargo, cargo install, cargo search)
  crates            crates.io (cargo search, crates CLI)
  composer          PHP (composer, composer require)
  pub               Dart (pub, pub get, flutter pub)
  swift             Swift (swift, swiftc, swift package)

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🎮 GAMING & EMULATION")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  steam              Steam (steam, steamcmd)
  lutris            Linux gaming (lutris, lutris -i)
  retroarch         RetroArch (retroarch, ra)
  dolphin           Dolphin (dolphin-emu, dolphin)
  pcsx2             PCSX2 (pcsx2, pcsx2-qt)
  cemu              Cemu (cemu, cemuhook)
  yuzu              Yuzu (yuzu, yuzu-emu)
  ryujinx           Ryujinx (ryujinx, ryujinx-amd)
  rpcs3             RPCS3 (rpcs3, rpcs3-gtk)
  mame              MAME (mame, mame64)
  dosbox            DOSBox (dosbox, dosbox-x)
  scummvm           ScummVM (scummvm, scummvm -g)
  openemu           OpenEmu (openemu, openemu --help)
  boxes             Boxes (boxes, boxes -d)
  qemu              QEMU (qemu, qemu-system-x86_64)
  virt-manager      Virt-Manager (virt-manager, virsh)

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🔧 BUILD TOOLS & COMPILERS")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  make <target>      Make (make, makefile, cmake)
  cmake             CMake (cmake, cmake --build)
  meson             Meson (meson, meson setup, ninja)
  ninja             Ninja (ninja, ninja -t)
  bazel             Bazel (bazel, bazel build)
  scons             Scons (scons, scons -Q)
  gnumake           GNU Make (gmake, make)
  xcodebuild        Xcode (xcodebuild, xcodebuild -scheme)
  msbuild           MSBuild (msbuild, dotnet build)
  rake              Rake (rake, rake -T)
  grunt             Grunt (grunt, grunt --help)
  gulp              Gulp (gulp, gulp --tasks)
  webpack           Webpack (webpack, webpack-cli)
  esbuild            ESBuild (esbuild, esbuild app.js)
  vite              Vite (vite, vite build)
  snowpack          Snowpack (snowpack, snowpack build)

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("🎵 AUDIO & MUSIC")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  spotify            Spotify (spotify, spotifyd, spotify-tui)
  mpd               Music Player Daemon (mpd, mpc, ncmpcpp)
  cmus              C* Music Shell (cmus, cmus-remote)
  mopidy            Mopidy (mopidy, mopidy-iris)
  audacious         Audacious (audacious, audacious -e)
  vlc               VLC (vlc, cvlc, vlc -I rc)
  ffplay            FFplay (ffplay, ffplay -nodisp)
  sox               SoX (sox, sox effect)
  lame              LAME (lame, lame --preset)
  flac              FLAC (flac, metaflac)
  faac              FAAC (faac, faad)
  opus              Opus (opusenc, opusdec)
  jackd             JACK (jackd, jack_*)
  carla             Carla (carla, carla-plugin)
  hydrogen          Hydrogen (hydrogen, hydrogen.bin)
  ardour            Ardour (ardour, ardour7)

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("🎬 VIDEO & STREAMING")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  ffmpeg             FFmpeg (ffmpeg, ffprobe, ffplay)
  obs                OBS Studio (obs, obs-cli, obs-ffmpeg)
  vlc                VLC (vlc, cvlc, vlm)
  handbrake         HandBrake (handbrake, handbrake-cli)
  mpv                MPV (mpv, mpv --no-video)
  youtube-dl        yt-dlp (yt-dlp, youtube-dl)
  streamlink         Streamlink (streamlink, streamlink-cli)
  ffmpeg -i <in>    Convert (ffmpeg -i, ffmpeg -c:v)
  ffmpeg -i <in> -ss Seek (ffmpeg -ss, ffmpeg -t)
  ffmpeg -i <in> -r  FPS (ffmpeg -r, ffmpeg -filter:v)
  ffmpeg -i <in> -s  Scale (ffmpeg -s, ffmpeg -vf scale)
  ffmpeg -i <in> -b  Bitrate (ffmpeg -b:v, -b:a)
  ffmpeg -i <in> -c:v Codec (ffmpeg -c:v libx264)
  ffmpeg -i <in> -crf CRF (ffmpeg -crf, -preset)
  ffmpeg -i <in> -filter_complex Filtergraph (ffmpeg -filter_complex)

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("📝 TEXT & DOCUMENTATION")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  pandoc             Doc converter (pandoc, pandoc -t, -s)
  latex              LaTeX (latex, pdflatex, xelatex)
  texlive           TeX Live (texlive, tlmgr)
  markdown          Markdown (markdown, markdown_py)
  mkdocs            MkDocs (mkdocs, mkdocs build)
  jekyll            Jekyll (jekyll, bundle exec jekyll)
  hugo              Hugo (hugo, hugo server)
  docusaurus        Docusaurus (docusaurus, docusaurus build)
  sphinx            Sphinx (sphinx-build, sphinx-quickstart)
  asciidoc          AsciiDoc (asciidoctor, asciidoc)
  retext            ReText (retext, retext-edit)
  typora            Typora (typora, typora --help)
  notion            Notion (notion, notion-cli)
  obsidian          Obsidian (obsidian, obsidian-import)
  vscode            VS Code (code, code --install-extension)
  vim                Vim (vim, vimtutor, nvim)
  nano               Nano (nano, nano -c)
  emacs             Emacs (emacs, emacs -nw)

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("💾 BACKUP & SYNC")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  rsync <src> <dest>  Sync (rsync, rsync -avz, rsync -e ssh)
  rclone             Cloud sync (rclone, rclone copy, rclone mount)
  borg              Borg (borgmatic, borg, borg create)
  restic            Restic (restic, restic backup, restic restore)
  duplicati         Duplicati (duplicati, duplicati-cli)
  duplicity         Duplicity (duplicity, duplicity incr)
  tar               Archive (tar, tar -cvf, tar -xvf)
  zip               Zip (zip, zip -r, unzip)
  7z                7-Zip (7z, 7z a, 7z x)
  gzip              Gzip (gzip, gunzip, zcat)
  xz                XZ (xz, unxz, xzcat)
  bzip2             Bzip2 (bzip2, bunzip2, bzcat)
  rar                RAR (rar, unrar, winrar)

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🌍 REMOTE DESKTOP & ACCESS")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  ssh                SSH (ssh, ssh-keygen, ssh-copy-id)
  rdesktop          RDP (rdesktop, xfreerdp, remmina)
  vnc                VNC (vncserver, vncviewer, tigervnc)
  xfreerdp          FreeRDP (xfreerdp, xfreerdp /u /p)
  x2goclient        X2Go (x2goclient, x2goserver)
  nomachine         NoMachine (nomachine, nxserver)
  teamviewer        TeamViewer (teamviewer, teamviewer-cli)
  anydesk           AnyDesk (anydesk, anydesk-cli)
  chrome-rdp        Chrome RDP (chrome-remote-desktop)
  parsec            Parsec (parsec, parsecd)
  moonlight         Moonlight (moonlight, moonlight-embedded)
  sunshine          Sunshine (sunshine, sunshine-app)

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🔐 CRYPTOGRAPHY & ENCRYPTION")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  gpg                GPG (gpg, gpg2, gpg-agent)
  openssl            OpenSSL (openssl, openssl enc, openssl req)
  ssh-keygen        SSH keys (ssh-keygen, ssh-copy-id)
  keybase            KeyBase (keybase, kbpgp)
  age                Age (age, age-keygen)
  sops               SOPS (sops, sops -e, sops -d)
  vault              Vault (vault, vault agent, vault server)
  bitwarden         Bitwarden (bw, bitwarden-cli)
  1password         1Password (op, 1password-cli)
  keepassxc         KeePass (keepassxc, keepassxc-cli)
  minisign          Minisign (minisign, minisign -S)
  signify           Signify (signify-openbsd)
  cfssl             CFSSL (cfssl, cfssljson)
  step              Step (step, step certificate)

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("☁️ GCP & FIREBASE")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  gcloud init        GCP init (gcloud init, gcloud auth)
  gcloud compute    Compute (gcloud compute, gc compute)
  gsutil            GCS (gsutil, gsutil -m, gsutil rsync)
  bq                BigQuery (bq query, bq mk)
  firebase          Firebase (firebase, firebase init)
  firebase deploy   Deploy (firebase deploy, firebase hosting)
  flutter           Flutter (flutter, flutter create)
  google-auth       Auth (gcloud auth, gcloud auth application-default)
  cbt               Cloud Bigtable (cbt, cbt createtable)
  cdc               CDC (gcloud dataflow, cdc)
  datastore         Datastore (gcloud datastore)
  spanner           Cloud Spanner (gcloud spanner)
  firestore         Firestore (gcloud firestore)

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("🖥️ HARDWARE & SYSTEM INFO")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  lscpu              CPU info (lscpu, lstopo)
  lsblk              Block devices (lsblk, blkid)
  lsusb              USB devices (lsusb, lsusb -t)
  lspci              PCI devices (lspci, lspci -v)
  dmidecode          DMI (dmidecode, -t processor, -t memory)
  inxi               System info (inxi, inxi -Fz)
  neofetch           Neofetch (neofetch, neofetch --ascii)
  hwinfo             HW info (hwinfo, hwinfo --short)
  lshw               List HW (lshw, lshw -short)
  sensors            Sensors (sensors, sensors-detect)
  smartctl           SMART (smartctl, smartctl -a)
  nvme               NVMe (nvme, nvme list)
  lsscsi             SCSI (lsscsi, lsscsi -v)
  procinfo           Proc info (procinfo, -f)

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("📊 CI/CD PIPELINES")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  jenkins            Jenkins (jenkins, jenkins-cli)
  gitlab-ci          GitLab CI (gitlab-runner, gitlab-ci)
  github-actions     GitHub Actions (gh, gh run)
  circleci           CircleCI (circleci, circleci build)
  travis             Travis CI (travis, travis-ci)
  bitbucket-pipe    Bitbucket (bitbucket-pipe, bb)
  drone              Drone CI (drone, drone-cli)
  argo-cd            Argo CD (argocd, argocd app)
  argo-workflows    Argo (argo, argo submit)
  tekton             Tekton (tekton, tkn)
  jenkins-x          Jenkins X (jx, jx3)
  spinnaker          Spinnaker (spin, halyard)
  Azure-Pipelines   Azure (azure-pipelines, az pipelines)
  codebuild          AWS CodeBuild (codebuild, aws codebuild)
  codeartifact       AWS CodeArtifact (codeartifact, aws codeartifact)

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("🔧 UTILITIES & TOOLS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  tldr               Simplified man (tldr, tldr -u)
  bat                Bat (bat, batcat, bat --style)
  exa                Modern ls (exa, exa -l, exa -T)
  lsd                LSD (lsd, lsd -l, lsd --tree)
  dog                DNS (dog, dog -v)
  httpie             HTTP (httpie, http)
  xh                 HTTP (xh, xh --curl)
  curlie             Curlie (curlie, curlie -v)
  borg               Borg (borg, borgmatic)
  duf                Disk usage (duf, duf -hide)
  dust               Dust (dust, dust -d)
  ncdu               NCurses DU (ncdu, ncdu -r)
  tldr               TLDR (tldr, tldr -u)
  cheat              Cheat (cheat, cheat -l)
  exiftool           EXIF (exiftool, exiftool -r)
  jq                 JSON (jq, jq '.key')
  yq                 YAML (yq, yq -y, yq -o json)
  toml               TOML (tomlq, cargo-toml)
  xsv                CSV (xsv, xsv slice, xsv search)
  csvkit             CSVKit (csvkit, csvsql)

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🚀 LAUNCHERS & PRODUCTIVITY")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  alacritty          Alacritty (alacritty, alacritty -e)
  kitty              Kitty (kitty, kitty +kitten)
  iterm              iTerm2 (iterm2, iterm2-profile)
  terminal           Terminal (terminal, gnome-terminal)
  rofi               Rofi (rofi, rofi -show)
  dmenu              Dmenu (dmenu, dmenu_run)
  wofi               Wofi (wofi, wofi --show)
  albert             Albert (albert, albert-launcher)
  raycast            Raycast (raycast, raycast --help)
  spotifyd           Spotifyd (spotifyd, spotifyd --config)
  lemonbar           Lemonbar (lemonbar, polybar)
  polybar            Polybar (polybar, polybar example)
  yabai              Yabai (yabai, yabai -m)
  khd                KHD (khd, khd -e)
  autokey            AutoKey (autokey-gtk, autokey-qt)
  hammerspoon        Hammerspoon (hammerspoon, hs)

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("💻 SHELLS & TERMINALS")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  bash               Bash (bash, bash -c, /bin/bash)
  zsh                Zsh (zsh, zsh -c, oh-my-zsh)
  fish               Fish (fish, fish -c, fisher)
  powershell        PowerShell (pwsh, powershell)
  sh                 POSIX sh (sh, dash, ash)
  dash               Dash (dash, dash -c)
  ksh                KornShell (ksh, ksh93)
  tcsh               Tcsh (tcsh, csh)
  elvish             Elvish (elvish, elvish -c)
  xonsh              Xonsh (xonsh, xonsh -c)
  nu                 Nushell (nu, nu -c)
  ion                Ion (ion, ion -c)
  oil                Oil (oil, oil -c)
  rc                 RC (rc, rc -c)

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("🔌 NETWORK TOOLS")}
${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
  netstat            Network stats (netstat, netstat -tulpn)
  ss                 Socket stats (ss, ss -tunapl)
  ip                 IP command (ip, ip addr, ip link)
  dig                Dig (dig, dig +short)
  nslookup           NSLookup (nslookup, host)
  host               Host (host, host -t)
  whois              Whois (whois, whois -h)
  ifconfig           Ifconfig (ifconfig, ifconfig -a)
  iwconfig          Wireless (iwconfig, iw list)
  ethtool           Ethernet (ethtool, ethtool -i)
  nmap              Port scanner (nmap, nmap -sV)
  netcat            Netcat (nc, nc -l, nc -v)
  socat             SOCAT (socat, socat -)
  ngrep             Ngrep (ngrep, ngrep -i)
  tcpdump           Tcpdump (tcpdump, tcpdump -i)
  wireshark         Wireshark (wireshark, tshark)
  mitmproxy         MITMProxy (mitmproxy, mitmdump)
  bettercap         BetterCAP (bettercap, bettercap -iface)

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("📡 CONTAINER ORCHESTRATION")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  kubernetes         K8s (kubectl, kubeadm, kubelet)
  helm               Helm (helm, helm install, helm repo)
  kustomize          Kustomize (kustomize, kubectl -k)
  istio              Istio (istioctl, istio operator)
  linkerd            Linkerd (linkerd, linkerd2)
  consul             Consul (consul, consul agent)
  etcd               Etcd (etcd, etcdctl)
  nomad              Nomad (nomad, nomad agent)
  swarm              Docker Swarm (docker swarm, docker stack)
  rancher            Rancher (rancher, rancher-compose)
  openshift          OpenShift (oc, odo)
  k3s                K3s (k3s, k3s server)
  k3d                K3d (k3d, k3d cluster)
  k0s                K0s (k0s, k0s controller)
  microk8s           MicroK8s (microk8s, microk8s enable)
  kubespray          Kubespray (ansible-playbook)
  kubeadm            KubeAdm (kubeadm, kubeadm init)
  kubectx            Kube Context (kubectx, kubectx -)
  kubens             Kube Namespace (kubens, kubens -)
  stern              Stern (stern, stern -n kube-system)
  k9s                K9s (k9s, k9s --help)
  lens               Lens (lens, lens-cli)

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("🧪 TESTING FRAMEWORKS")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  jest               Jest (jest, npx jest)
  vitest             Vitest (vitest, npx vitest)
  mocha              Mocha (mocha, npx mocha)
  jasmine            Jasmine (jasmine, npx jasmine)
  pytest             PyTest (pytest, python -m pytest)
  unittest           Unittest (python -m unittest)
  nose2              Nose2 (nose2, python -m nose2)
  rspec              RSpec (rspec, bundle exec rspec)
  minitest          Minitest (minitest, rake test)
  go test            Go test (go test, go test -v)
  go bench           Go bench (go test -bench=.)
  cargo test         Rust test (cargo test, cargo test --lib)
  ctest              CTest (ctest, ctest -V)
  catch2             Catch2 (catch2, ./tests)
  gtest              GTest (gtest, make test)
  cppunit            CppUnit (cppunit, cppunit-config)
  phpunit            PHPUnit (phpunit, ./phpunit)
  behat              Behat (behat, ./behat)
  cypress            Cypress (cypress, npx cypress)
  playwright         Playwright (playwright, npx playwright)
  puppeteer         Puppeteer (puppeteer, puppeteer-cli)
  selenium           Selenium (selenium, webdriver)
  k6                 K6 (k6, k6 run)
  gatling            Gatling (gatling, gatling.sh)
  locust             Locust (locust, locust -f)

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("📋 ALIASES & SHORTCUTS")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  g                  git
  gs                 git status
  ga                 git add
  gc                 git commit
  gp                 git push
  gl                 git pull
  gd                 git diff
  gst                git status
  gco                git checkout
  br                 git branch
  d                  docker
  dc                 docker compose
  dps                docker ps
  dpa                docker ps -a
  di                 docker images
  dex                docker exec -it
  k                  kubectl
  ka                 kubectl get all
  kgp                kubectl get pods
  kgs                kubectl get svc
  ll                 ls -la
  la                 ls -a
  l                  ls -la
  ..                 cd ..
  ...                cd ../..
  ~~                 cd ~
  -                  cd -
  h                  htop
  t                  top
  v                  vim
  n                  nano
  q                  exit
  c                  clear
  py                 python
  py3                python3
  pipi               pip install
  npmi               npm install
  npms               npm install -S
  yai                yarn add
  yad                yarn add -D
  serve              http-server -p

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🎯 QUICK TIPS")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  cheatsheet        Show 700+ extended commands
  !<cmd>             Run shell command directly
  Tab                Auto-complete commands
  ↑/↓                Command history navigation
  Ctrl+C             Cancel current input
  Ctrl+D             Exit shell (or logout)
  Ctrl+L             Clear screen (like clear)
  Ctrl+R             Reverse search history
  Ctrl+A             Move to line start
  Ctrl+E             Move to line end
  Ctrl+U             Clear line before cursor
  Ctrl+K             Clear line after cursor
  Ctrl+W             Delete word before cursor

${chalk.gray("══════════════════════════════════════════════════════════════════════════")}
${chalk.gray("💡 Type 'help' for basic commands, 'cheatsheet' for this extended list")}
${chalk.gray("══════════════════════════════════════════════════════════════════════════")}
`;
}

async function handleCommand(input: string): Promise<boolean> {
  const raw = input.trim();
  if (!raw) return false;
  
  if (raw.startsWith("!")) {
    try { execSync(raw.slice(1), { encoding: "utf-8", stdio: "inherit" }); }
    catch (e: any) { handleError("shell", e); }
    return false;
  }

  const allAliases = { ...aliases, ...aliasesCustom };
  let resolved = raw;
  const firstWord = raw.split(/\s+/)[0].toLowerCase();
  if (allAliases[firstWord]) resolved = allAliases[firstWord] + raw.slice(firstWord.length);

  const parts = resolved.split(/\s+/);
  let cmd = parts[0]?.toLowerCase() || "";
  let args = parts.slice(1);

  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    console.log(chalk.cyan(`DevMate v${getVersion()} - OMNI-SHELL`));
    console.log(chalk.gray("Any Shell • Any Command • Any Platform • Any Device"));
    return false;
  }
  
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(help());
    return false;
  }

  if (cmd.startsWith("-") && !allAliases[cmd]) {
    err(`Unknown flag: ${cmd}`);
    console.log(chalk.gray("Use 'help' for available commands"));
    return false;
  }

  if (customCommands[cmd]) {
    try { execSync(customCommands[cmd], { encoding: "utf-8", stdio: "inherit" }); }
    catch (e: any) { handleError(cmd, e); }
    return false;
  }

  switch (cmd) {
    case "help": case "?": console.log(help()); break;
    case "extended": case "cheatsheet": case "all": case "help-all": console.log(extendedHelp()); break;

    case "install": case "setup": {
      console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║           DevMate Self-Installation                          ║
╚══════════════════════════════════════════════════════════════╝
`));
      const checks = [
        { name: "Bun", check: () => execSync("bun --version", { encoding: "utf-8" }) },
        { name: "Node.js", check: () => execSync("node --version", { encoding: "utf-8" }) },
        { name: "npm", check: () => execSync("npm --version", { encoding: "utf-8" }) },
        { name: "curl", check: () => execSync("curl --version", { encoding: "utf-8" }) },
      ];
      
      console.log(chalk.yellow("Checking dependencies...\n"));
      let allOk = true;
      for (const c of checks) {
        try {
          const ver = c.check().trim();
          console.log(chalk.green("✓") + ` ${c.name}: ${ver}`);
        } catch {
          console.log(chalk.red("✗") + ` ${c.name}: not found`);
          allOk = false;
        }
      }
      
      if (!allOk) {
        console.log(chalk.yellow("\nMissing dependencies. Install with:"));
        console.log(chalk.gray("  • Bun: curl -fsSL https://bun.sh/install | bash"));
        console.log(chalk.gray("  • npm: comes with Node.js"));
      } else {
        console.log(chalk.green("\n✓ All dependencies installed!"));
      }
      
      console.log(chalk.cyan("\nDevMate is ready to use."));
      break;
    }

    case "doctor": case "diag": case "check": {
      console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║           DevMate Diagnostics                                ║
╚══════════════════════════════════════════════════════════════╝
`));
      
      console.log(chalk.yellow("Environment:"));
      console.log(`  OS: ${process.platform}`);
      console.log(`  Arch: ${process.arch}`);
      console.log(`  Node: ${process.version}`);
      console.log(`  CWD: ${process.cwd()}`);
      console.log(`  Home: ${HOME}`);
      console.log(`  Config: ${CONFIG_DIR}`);
      
      console.log(chalk.yellow("\nChecking tools..."));
      const tools = ["git", "docker", "kubectl", "npm", "bun", "curl", "node"];
      for (const t of tools) {
        try {
          const ver = execSync(`${t} --version 2>/dev/null | head -1`, { encoding: "utf-8" }).trim();
          console.log(chalk.green("✓") + ` ${t}: ${ver.slice(0, 40)}`);
        } catch {
          console.log(chalk.gray("○") + ` ${t}: not installed`);
        }
      }
      
      console.log(chalk.yellow("\nConfig files:"));
      const configs = ["custom_commands.json", "aliases.json", "snippets.json", "bookmarks.json"];
      for (const c of configs) {
        const f = join(CONFIG_DIR, c);
        if (existsSync(f)) {
          const data = loadJSON(f, {});
          const count = Object.keys(data).length;
          console.log(chalk.green("✓") + ` ${c}: ${count} items`);
        } else {
          console.log(chalk.gray("○") + ` ${c}: not created`);
        }
      }
      
      console.log(chalk.green("\n✓ Diagnostics complete"));
      break;
    }

    case "sysinfo": case "system-info": case "sys": {
      console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                   System Information                        ║
╚══════════════════════════════════════════════════════════════╝
`));
      try {
        const os = execSync("uname -a", { encoding: "utf-8" }).trim();
        const uptime = execSync("uptime -p 2>/dev/null || uptime", { encoding: "utf-8" }).trim();
        const mem = execSync("free -h", { encoding: "utf-8" }).trim();
        const disk = execSync("df -h / | tail -1", { encoding: "utf-8" }).trim();
        
        console.log(chalk.yellow("OS:") + ` ${os}`);
        console.log(chalk.yellow("Uptime:") + ` ${uptime}`);
        console.log(chalk.yellow("\nMemory:"));
        console.log(chalk.gray(mem));
        console.log(chalk.yellow("\nDisk:"));
        console.log(chalk.gray(disk));
      } catch (e: any) {
        err("Could not get system info");
      }
      break;
    }

    case "ports": case "listening": {
      try {
        const out = execSync("ss -tuln 2>/dev/null || netstat -tuln 2>/dev/null || echo 'No port info'", { encoding: "utf-8" });
        const lines = out.trim().split("\n").slice(0, 15);
        console.log(chalk.cyan("Listening Ports:"));
        lines.forEach(l => console.log(chalk.gray(l)));
      } catch { err("Could not list ports"); }
      break;
    }

    case "refresh": case "reload": {
      console.log(chalk.yellow("Rebuilding..."));
      try {
        execSync("bun run build", { cwd: process.cwd(), stdio: "inherit" });
        success("Build complete!");
      } catch { err("Build failed"); }
      break;
    }

    case "quick": case "actions": {
      const actions = [
        ["npm i", "Install npm dependencies"],
        ["npm run dev", "Start dev server"],
        ["npm run build", "Build project"],
        ["npm test", "Run tests"],
        ["git status", "Check git status"],
        ["git add . && git commit -m", "Quick commit"],
        ["docker ps", "List containers"],
        ["kubectl get pods", "List K8s pods"],
      ];
      const rows = actions.map(([cmd, desc]) => [chalk.cyan(cmd), chalk.gray(desc)]);
      tableRender(["Command", "Description"], rows, { headColor: "green" });
      break;
    }

    case "npm-outdated": case "outdated": {
      try {
        const out = execSync("npm outdated --json 2>/dev/null || echo '{}'", { encoding: "utf-8" });
        const pkgs = JSON.parse(out);
        if (Object.keys(pkgs).length === 0) {
          console.log(chalk.green("✓ All packages up to date!"));
        } else {
          const rows = Object.entries(pkgs).map(([name, info]: [string, any]) => 
            [name, info.current || "-", info.wanted, info.latest]
          );
          tableRender(["Package", "Current", "Wanted", "Latest"], rows, { headColor: "yellow" });
        }
      } catch { err("Not a npm project"); }
      break;
    }

    case "npm-audit": case "audit": {
      try {
        const out = execSync("npm audit --json 2>/dev/null || echo '{}'", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        const result = JSON.parse(out);
        if (result.vulnerabilities) {
          const vulns = result.vulnerabilities;
          console.log(chalk.red(`⚠ Found vulnerabilities:`));
          console.log(`  Critical: ${vulns.critical || 0}`);
          console.log(`  High: ${vulns.high || 0}`);
          console.log(`  Moderate: ${vulns.moderate || 0}`);
          console.log(`  Low: ${vulns.low || 0}`);
        } else {
          console.log(chalk.green("✓ No vulnerabilities found!"));
        }
      } catch { console.log(chalk.green("✓ No vulnerabilities found!")); }
      break;
    }

    case "npm-deps": case "deps": {
      try {
        const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
        const deps = pkg.dependencies || {};
        const devDeps = pkg.devDependencies || {};
        
        console.log(chalk.cyan(`Dependencies (${Object.keys(deps).length}):`));
        const rows = Object.entries(deps).map(([name, ver]) => [name, ver as string]);
        tableRender(["Package", "Version"], rows.slice(0, 20), { headColor: "blue" });
        
        if (Object.keys(devDeps).length > 0) {
          console.log(chalk.cyan(`\nDev Dependencies (${Object.keys(devDeps).length}):`));
          const devRows = Object.entries(devDeps).map(([name, ver]) => [name, ver as string]);
          tableRender(["Package", "Version"], devRows.slice(0, 20), { headColor: "magenta" });
        }
      } catch { err("No package.json found"); }
      break;
    }

    case "npm-scripts": case "scripts": {
      try {
        const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
        const scripts = pkg.scripts || {};
        if (Object.keys(scripts).length === 0) {
          err("No scripts defined");
        } else {
          const rows = Object.entries(scripts).map(([name, cmd]) => [chalk.cyan(name), cmd as string]);
          tableRender(["Script", "Command"], rows, { headColor: "green" });
        }
      } catch { err("No package.json found"); }
      break;
    }

    case "npm-info": case "pkg-info": {
      if (!args[0]) { err("Usage: npm-info <package>"); break; }
      try {
        const out = execSync(`npm view ${args[0]} --json`, { encoding: "utf-8", maxBuffer: 1024 * 1024 });
        const info = JSON.parse(out);
        console.log(chalk.cyan(`${info.name} v${info.version}`));
        console.log(chalk.gray(info.description || "No description"));
        console.log(`\n${chalk.yellow("Latest:")} ${info["dist-tags"]?.latest || "N/A"}`);
        console.log(`${chalk.yellow("License:")} ${info.license || "N/A"}`);
        console.log(`${chalk.yellow("Author:")} ${info.author?.name || "N/A"}`);
        console.log(`${chalk.yellow("Repository:")} ${info.repository?.url || "N/A"}`);
      } catch { err(`Package '${args[0]}' not found`); }
      break;
    }

    case "node-version": case "node-ver": {
      try {
        const ver = execSync("node --version", { encoding: "utf-8" }).trim();
        const v8 = execSync("node -p 'process.versions.v8'", { encoding: "utf-8" }).trim();
        console.log(chalk.green(`Node.js: ${ver}`));
        console.log(chalk.gray(`V8: ${v8}`));
      } catch { err("Node.js not found"); }
      break;
    }

    case "bun-version": case "bun-ver": {
      try {
        const ver = execSync("bun --version", { encoding: "utf-8" }).trim();
        console.log(chalk.green(`Bun: ${ver}`));
      } catch { err("Bun not found"); }
      break;
    }

    case "what": case "which": {
      if (!args[0]) { err("Usage: what <command>"); break; }
      try {
        const path = execSync(`which ${args[0]}`, { encoding: "utf-8" }).trim();
        success(`Found: ${path}`);
      } catch { err(`${args[0]} not found`); }
      break;
    }

    case "version": case "--version": case "-v":
      console.log(chalk.cyan(`DevMate v${getVersion()}`));
      console.log(chalk.gray("Any Shell • Any Command • Any Platform • Any Device"));
      break;
     
    case "ls": case "ll": case "la": case "l": case "lt": case "llh":
      try { console.log(execSync(`ls ${cmd.includes("l") ? "-la" : ""} ${args[0] || "."}`, { encoding: "utf-8" })); }
      catch (e: any) { handleError("ls", e); } break;
      
    case "cd": 
      try { process.chdir(args[0] || HOME); success(process.cwd()); } 
      catch (e: any) { handleError("cd", e, "Directory doesn't exist"); } break;
      
    case "cat": case "head": case "tail": case "less":
      if (!args[0]) err("Usage: cat <file>");
      else try { console.log(execSync(`${cmd} "${args[0]}"`, { encoding: "utf-8" })); }
      catch (e: any) { handleError(cmd, e, "File not found"); } break;
      
    case "pwd": console.log(process.cwd()); break;
    
    case "mkdir": 
      if (!args[0]) err("Usage: mkdir <dir>");
      else try { execSync(`mkdir -p "${args[0]}"`); success(`Created: ${args[0]}`); }
      catch (e: any) { handleError("mkdir", e); } break;
      
    case "rm": case "rmdir":
      if (!args[0]) err("Usage: rm <file|dir>");
      else try { execSync(`rm -${cmd === "rmdir" ? "d" : "rf"} "${args[0]}"`); success(`Removed: ${args[0]}`); }
      catch (e: any) { handleError("rm", e); } break;
      
    case "touch":
      if (!args[0]) err("Usage: touch <file>");
      else try { execSync(`touch "${args[0]}"`); success(`Created: ${args[0]}`); }
      catch (e: any) { handleError("touch", e); } break;
      
    case "cp":
      if (args.length < 2) err("Usage: cp <src> <dest>");
      else try { execSync(`cp -r "${args[0]}" "${args[1]}"`); success("Copied"); }
      catch (e: any) { handleError("cp", e); } break;
      
    case "mv":
      if (args.length < 2) err("Usage: mv <src> <dest>");
      else try { execSync(`mv "${args[0]}" "${args[1]}"`); success("Moved"); }
      catch (e: any) { handleError("mv", e); } break;
      
    case "tree": {
      const tPath = args[0] || '.';
      const tDepth = parseInt(args[1]) || 3;
      console.log(chalk.cyan(`📁 ${resolve(tPath)}`) + '\n' + treeRender(resolve(tPath), '', tDepth));
      break;
    }

    case "find-files": case "ff": {
      const pattern = args[0] || "*";
      try {
        const out = execSync(`find . -name "*${pattern}*" -type f 2>/dev/null | head -20`, { encoding: "utf-8" });
        const files = out.trim().split("\n").filter(Boolean);
        if (files.length === 0) {
          console.log(chalk.gray("No files found"));
        } else {
          files.forEach(f => console.log(chalk.gray(f)));
        }
      } catch { err("Find failed"); }
      break;
    }

    case "find-dirs": case "fd": {
      const pattern = args[0] || "*";
      try {
        const out = execSync(`find . -name "*${pattern}*" -type d 2>/dev/null | head -20`, { encoding: "utf-8" });
        const dirs = out.trim().split("\n").filter(Boolean);
        if (dirs.length === 0) {
          console.log(chalk.gray("No directories found"));
        } else {
          dirs.forEach(d => console.log(chalk.blue(d)));
        }
      } catch { err("Find failed"); }
      break;
    }

    case "recent": case "recent-files": {
      const days = args[0] || "7";
      try {
        const out = execSync(`find . -type f -mtime -${days} -ls 2>/dev/null | head -20`, { encoding: "utf-8" });
        console.log(chalk.cyan(`Files modified in last ${days} days:`));
        console.log(chalk.gray(out));
      } catch { err("Find failed"); }
      break;
    }

    case "size": case "big-files": {
      const limit = args[0] || "1M";
      try {
        const out = execSync(`find . -type f -size +${limit} -ls 2>/dev/null | sort -k7 -r | head -15`, { encoding: "utf-8" });
        console.log(chalk.cyan(`Files larger than ${limit}:`));
        console.log(chalk.gray(out));
      } catch { err("Find failed"); }
      break;
    }

    case "du": case "disk-usage": {
      try {
        const out = execSync("du -sh * 2>/dev/null | sort -hr | head -15", { encoding: "utf-8" });
        console.log(chalk.cyan("Disk usage:"));
        const rows = out.trim().split("\n").map(l => {
          const [size, path] = l.split("\t");
          return [chalk.yellow(size), path];
        });
        tableRender(["Size", "Path"], rows, { headColor: "cyan" });
      } catch { err("du failed"); }
      break;
    }

    case "count": case "line-count": {
      try {
        const ext = args[0] || "*";
        const out = execSync(`find . -name "*.${ext}" -type f -exec wc -l {} + 2>/dev/null | tail -1`, { encoding: "utf-8" });
        const total = out.trim().split("\n").pop() || "";
        const lines = total.trim().split(/\s+/)[0];
        console.log(chalk.green(`Total lines in .${ext} files: ${lines}`));
      } catch { err("Count failed"); }
      break;
    }

    case "uuid": case "guid": {
      const crypto = require("crypto");
      const uuid = crypto.randomUUID();
      console.log(chalk.cyan(uuid));
      break;
    }

    case "hash": case "checksum": {
      const file = args[0];
      const algo = args[1] || "sha256";
      if (!file) { err("Usage: hash <file> [algorithm]"); break; }
      try {
        const out = execSync(`${algo}sum "${file}"`, { encoding: "utf-8" }).trim();
        const [hash] = out.split(" ");
        console.log(chalk.green(`${algo.toUpperCase()}: ${hash}`));
      } catch { err("Hash failed"); }
      break;
    }

    case "base64-encode": case "b64e": {
      if (!args[0]) { err("Usage: b64e <string>"); break; }
      const encoded = Buffer.from(args.join(" ")).toString("base64");
      console.log(encoded);
      break;
    }

    case "base64-decode": case "b64d": {
      if (!args[0]) { err("Usage: b64d <string>"); break; }
      try {
        const decoded = Buffer.from(args.join(" "), "base64").toString("utf-8");
        console.log(decoded);
      } catch { err("Invalid base64"); }
      break;
    }

    case "url-encode": case "urle": {
      if (!args[0]) { err("Usage: urle <string>"); break; }
      const encoded = encodeURIComponent(args.join(" "));
      console.log(encoded);
      break;
    }

    case "url-decode": case "urld": {
      if (!args[0]) { err("Usage: urld <string>"); break; }
      try {
        const decoded = decodeURIComponent(args.join(" "));
        console.log(decoded);
      } catch { err("Invalid URL encoding"); }
      break;
    }

    case "random": case "rand": {
      const min = parseInt(args[0]) || 0;
      const max = parseInt(args[1]) || 100;
      const num = Math.floor(Math.random() * (max - min + 1)) + min;
      console.log(chalk.green(String(num)));
      break;
    }

    case "password": case "passgen": {
      const len = parseInt(args[0]) || 16;
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
      let pass = "";
      const bytes = require("crypto").randomBytes(len);
      for (let i = 0; i < len; i++) pass += chars[bytes[i] % chars.length];
      console.log(chalk.green(pass));
      break;
    }

    case "json-validate": case "json-valid": {
      const file = args[0];
      if (!file) { err("Usage: json-valid <file>"); break; }
      try {
        const content = readFileSync(file, "utf-8");
        JSON.parse(content);
        success("Valid JSON");
      } catch { err("Invalid JSON"); }
      break;
    }

    case "json-minify": case "json-min": {
      const file = args[0];
      if (!file) { err("Usage: json-min <file>"); break; }
      try {
        const content = readFileSync(file, "utf-8");
        console.log(JSON.stringify(JSON.parse(content)));
      } catch { err("Invalid JSON"); }
      break;
    }

    case "json-path": case "jpath": {
      const file = args[0];
      const path = args[1];
      if (!file || !path) { err("Usage: jpath <file> <json-path>"); break; }
      try {
        const content = readFileSync(file, "utf-8");
        const json = JSON.parse(content);
        const value = path.split(".").reduce((o: any, k) => o?.[k], json);
        console.log(JSON.stringify(value, null, 2));
      } catch { err("Invalid path or JSON"); }
      break;
    }

    // ===== CONTAINER & DEVOPS COMMANDS =====
    case "d": case "docker-ps": case "dps": {
      try {
        const ps = execSync("docker ps --format '{{.ID}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Names}}'", { encoding: "utf-8" });
        const rows = ps.trim().split("\n").filter(Boolean).map(l => {
          const [id, img, status, ports, name] = l.split("|");
          return [id.slice(0, 12), img.slice(0, 20), status.slice(0, 20), name];
        });
        tableRender(["ID", "Image", "Status", "Name"], rows, { headColor: "blue" });
      } catch { err("Docker not running"); }
      break;
    }

    case "dpa": case "docker-ps-all": {
      try {
        const ps = execSync("docker ps -a --format '{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}'", { encoding: "utf-8" });
        const rows = ps.trim().split("\n").filter(Boolean).map(l => {
          const [id, img, status, name] = l.split("|");
          return [id.slice(0, 12), img.slice(0, 25), status.slice(0, 25), name];
        });
        tableRender(["ID", "Image", "Status", "Name"], rows, { headColor: "red" });
      } catch { err("Docker not running"); }
      break;
    }

    case "di": case "docker-images": {
      try {
        const imgs = execSync("docker images --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}'", { encoding: "utf-8" });
        const rows = imgs.trim().split("\n").filter(Boolean).map(l => {
          const [id, repo, tag, size] = l.split("|");
          return [id.slice(0, 12), repo.slice(0, 25), tag, size];
        });
        tableRender(["ID", "Repository", "Tag", "Size"], rows, { headColor: "cyan" });
      } catch { err("Docker not running"); }
      break;
    }

    case "dstop": case "docker-stop-all": {
      try {
        execSync("docker ps -q | xargs docker stop 2>/dev/null", { encoding: "utf-8" });
        success("All containers stopped");
      } catch { err("Failed to stop containers"); }
      break;
    }

    case "drm": case "docker-rm-all": {
      try {
        execSync("docker ps -aq | xargs docker rm 2>/dev/null", { encoding: "utf-8" });
        success("All containers removed");
      } catch { err("Failed to remove containers"); }
      break;
    }

    case "drmi": case "docker-rmi-all": {
      try {
        execSync("docker images -q | xargs docker rmi 2>/dev/null", { encoding: "utf-8" });
        success("All images removed");
      } catch { err("Failed to remove images"); }
      break;
    }

    case "dclean": case "docker-clean": {
      try {
        execSync("docker system prune -af --volumes 2>/dev/null", { encoding: "utf-8" });
        success("Docker cleaned");
      } catch { err("Clean failed"); }
      break;
    }

    case "dlogs": case "docker-logs": {
      const container = args[0];
      if (!container) { err("Usage: dlogs <container-id>"); break; }
      try {
        execSync(`docker logs --tail 50 -f ${container}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("Container not found"); }
      break;
    }

    case "dex": case "docker-exec": {
      const [container, ...cmdArgs] = args;
      if (!container) { err("Usage: dex <container> <cmd>"); break; }
      try {
        execSync(`docker exec -it ${container} ${cmdArgs.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("Exec failed"); }
      break;
    }

    case "dc": case "dcompose": case "docker-compose-cmd": {
      try {
        execSync(`docker compose ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("Docker compose failed"); }
      break;
    }

    case "k": case "kubectl-cmd": {
      try {
        execSync(`kubectl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("kubectl not configured"); }
      break;
    }

    case "kgp": case "k8s-pods": {
      try {
        const out = execSync("kubectl get pods -o wide 2>/dev/null", { encoding: "utf-8" });
        console.log(chalk.cyan(out));
      } catch { err("kubectl not configured"); }
      break;
    }

    case "kgs": case "k8s-svc": {
      try {
        const out = execSync("kubectl get svc 2>/dev/null", { encoding: "utf-8" });
        console.log(chalk.cyan(out));
      } catch { err("kubectl not configured"); }
      break;
    }

    case "kgd": case "k8s-deploy": {
      try {
        const out = execSync("kubectl get deployments 2>/dev/null", { encoding: "utf-8" });
        console.log(chalk.cyan(out));
      } catch { err("kubectl not configured"); }
      break;
    }

    case "kga": case "k8s-all": {
      try {
        const out = execSync("kubectl get all 2>/dev/null", { encoding: "utf-8" });
        console.log(chalk.cyan(out));
      } catch { err("kubectl not configured"); }
      break;
    }

    case "kd": case "k8s-describe": {
      const resource = args[0];
      const name = args[1];
      if (!resource || !name) { err("Usage: kd <pod|svc> <name>"); break; }
      try {
        const out = execSync(`kubectl describe ${resource} ${name} 2>/dev/null`, { encoding: "utf-8" });
        console.log(chalk.cyan(out));
      } catch { err("Not found"); }
      break;
    }

    case "kl": case "k8s-logs": {
      const pod = args[0];
      if (!pod) { err("Usage: kl <pod-name>"); break; }
      try {
        execSync(`kubectl logs -f ${pod} 2>/dev/null`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("Logs failed"); }
      break;
    }

    case "kctx": case "k8s-contexts": {
      try {
        const out = execSync("kubectl config get-contexts 2>/dev/null", { encoding: "utf-8" });
        console.log(chalk.cyan(out));
      } catch { err("kubectl not configured"); }
      break;
    }

    case "kns": case "k8s-ns": {
      const ns = args[0];
      if (!ns) {
        try {
          const out = execSync("kubectl get ns 2>/dev/null", { encoding: "utf-8" });
          console.log(chalk.cyan(out));
        } catch { err("kubectl not configured"); }
      } else {
        try {
          execSync(`kubectl config set-context --current --namespace=${ns} 2>/dev/null`, { encoding: "utf-8" });
          success(`Switched to namespace: ${ns}`);
        } catch { err("Failed to switch namespace"); }
      }
      break;
    }

    // ===== CLOUD COMMANDS =====
    case "aws-cmd": {
      try {
        execSync(`aws ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("AWS CLI not configured"); }
      break;
    }

    case "aws-s3-ls": case "s3ls": {
      try {
        const out = execSync("aws s3 ls 2>/dev/null", { encoding: "utf-8" });
        const rows = out.trim().split("\n").filter(Boolean).map(l => {
          const parts = l.trim().split(/\s+/);
          return [parts[0], parts[1], parts.slice(2).join(" ")];
        });
        tableRender(["Date", "Time", "Bucket"], rows, { headColor: "yellow" });
      } catch { err("AWS CLI not configured"); }
      break;
    }

    case "s3cp": case "s3-copy": {
      const src = args[0];
      const dst = args[1];
      if (!src || !dst) { err("Usage: s3cp <src> <dest>"); break; }
      try {
        execSync(`aws s3 cp ${src} ${dst}`, { encoding: "utf-8", stdio: "inherit" });
        success("Copied");
      } catch { err("Copy failed"); }
      break;
    }

    case "s3sync": case "s3-sync": {
      const src = args[0];
      const dst = args[1];
      if (!src || !dst) { err("Usage: s3sync <src> <dest>"); break; }
      try {
        execSync(`aws s3 sync ${src} ${dst}`, { encoding: "utf-8", stdio: "inherit" });
        success("Synced");
      } catch { err("Sync failed"); }
      break;
    }

    case "gcloud-cmd": {
      try {
        execSync(`gcloud ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("gcloud not configured"); }
      break;
    }

    case "az-cmd": {
      try {
        execSync(`az ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("Azure CLI not configured"); }
      break;
    }

    // ===== MONITORING =====
    case "htop-cmd": case "top-cmd": {
      try {
        execSync("htop 2>/dev/null || top", { encoding: "utf-8", stdio: "inherit" });
      } catch { err("htop not installed"); }
      break;
    }

    case "btop-cmd": case "btop": {
      try {
        execSync("btop", { encoding: "utf-8", stdio: "inherit" });
      } catch { err("btop not installed"); }
      break;
    }

    case "glances-cmd": case "glances": {
      try {
        execSync("glances", { encoding: "utf-8", stdio: "inherit" });
      } catch { err("glances not installed"); }
      break;
    }

    case "iotop-cmd": case "iotop": {
      try {
        execSync("sudo iotop", { encoding: "utf-8", stdio: "inherit" });
      } catch { err("iotop not installed"); }
      break;
    }

    case "iftop-cmd": case "iftop": {
      try {
        execSync("sudo iftop", { encoding: "utf-8", stdio: "inherit" });
      } catch { err("iftop not installed"); }
      break;
    }

    case "ncdu-cmd": case "ncdu": {
      try {
        execSync("ncdu", { encoding: "utf-8", stdio: "inherit" });
      } catch { err("ncdu not installed"); }
      break;
    }

    case "strace-cmd": case "strace": {
      const pid = args[0];
      if (!pid) { err("Usage: strace <pid>"); break; }
      try {
        execSync(`strace -p ${pid}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("strace failed"); }
      break;
    }

    case "lsof-cmd": case "lsof": {
      const file = args[0];
      try {
        const out = execSync(file ? `lsof ${file}` : "lsof 2>/dev/null | head -20", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("lsof not available"); }
      break;
    }

    case "ss-netstat": case "ss": {
      try {
        const out = execSync("ss -tuln 2>/dev/null | head -20", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("ss not available"); }
      break;
    }

    // ===== LOGS =====
    case "logs": case "journal": {
      const service = args[0];
      if (!service) {
        try {
          execSync("journalctl -n 20", { encoding: "utf-8", stdio: "inherit" });
        } catch { err("journalctl not available"); }
      } else {
        try {
          execSync(`journalctl -u ${service} -n 20`, { encoding: "utf-8", stdio: "inherit" });
        } catch { err("Service not found"); }
      }
      break;
    }

    case "dmesg-cmd": case "dmesg": {
      try {
        const out = execSync("dmesg | tail -20", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("dmesg not available"); }
      break;
    }

    // ===== PROCESS MANAGEMENT =====
    case "pkill-cmd": case "pkill": {
      const name = args[0];
      if (!name) { err("Usage: pkill <process-name>"); break; }
      try {
        execSync(`pkill -f ${name}`, { encoding: "utf-8" });
        success(`Killed processes matching: ${name}`);
      } catch { err("No processes found"); }
      break;
    }

    case "killall-cmd": case "killall": {
      const name = args[0];
      if (!name) { err("Usage: killall <process-name>"); break; }
      try {
        execSync(`killall ${name}`, { encoding: "utf-8" });
        success(`Killed: ${name}`);
      } catch { err("Process not found"); }
      break;
    }

    case "pids": case "all-pids": {
      try {
        const out = execSync("ps -eo pid,ppid,cmd --no-headers | head -30", { encoding: "utf-8" });
        const rows = out.trim().split("\n").map(l => l.trim().split(/\s+/).slice(0, 3));
        tableRender(["PID", "PPID", "Command"], rows, { headColor: "cyan" });
      } catch { err("ps failed"); }
      break;
    }

    // ===== NETWORK =====
    case "curl-headers": case "curl-h": {
      const url = args[0];
      if (!url) { err("Usage: curl-h <url>"); break; }
      try {
        const out = execSync(`curl -I "${url}"`, { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("Request failed"); }
      break;
    }

    case "curl-json": case "curl-j": {
      const url = args[0];
      if (!url) { err("Usage: curl-j <url>"); break; }
      try {
        const out = execSync(`curl -s "${url}" | jq .`, { encoding: "utf-8" });
        console.log(out);
      } catch {
        try {
          const out = execSync(`curl -s "${url}"`, { encoding: "utf-8" });
          console.log(out);
        } catch { err("Request failed"); }
      }
      break;
    }

    case "wget-cmd": case "wget": {
      try {
        execSync(`wget ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("wget failed"); }
      break;
    }

    case "ssh-cmd": case "ssh": {
      const host = args[0];
      if (!host) { err("Usage: ssh <user@host>"); break; }
      try {
        execSync(`ssh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("SSH failed"); }
      break;
    }

    case "scp-cmd": case "scp": {
      const src = args[0];
      const dst = args[1];
      if (!src || !dst) { err("Usage: scp <source> <dest>"); break; }
      try {
        execSync(`scp ${src} ${dst}`, { encoding: "utf-8", stdio: "inherit" });
        success("Copied");
      } catch { err("SCP failed"); }
      break;
    }

    case "rsync-cmd": case "rsync": {
      try {
        execSync(`rsync ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("rsync failed"); }
      break;
    }

    case "dig-cmd": case "dig": {
      const domain = args[0];
      if (!domain) { err("Usage: dig <domain>"); break; }
      try {
        const out = execSync(`dig ${domain} ${args.slice(1).join(" ")}`, { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("dig failed"); }
      break;
    }

    case "nslookup-cmd": case "nslookup": {
      const domain = args[0];
      if (!domain) { err("Usage: nslookup <domain>"); break; }
      try {
        const out = execSync(`nslookup ${domain}`, { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("nslookup failed"); }
      break;
    }

    case "ping-cmd": case "ping": {
      const host = args[0] || "8.8.8.8";
      try {
        execSync(`ping -c 4 ${host}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("ping not available"); }
      break;
    }

    case "mtr-cmd": case "mtr": {
      const host = args[0] || "8.8.8.8";
      try {
        execSync(`mtr ${host}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("mtr not available"); }
      break;
    }

    case "nmap-cmd": case "nmap": {
      const target = args[0];
      if (!target) { err("Usage: nmap <target>"); break; }
      try {
        const out = execSync(`nmap ${target} 2>/dev/null`, { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        console.log(chalk.gray(out));
      } catch { err("nmap not available"); }
      break;
    }

    // ===== COMPRESSION =====
    case "zip-cmd": case "zip": {
      const [archive, ...files] = args;
      if (!archive || files.length === 0) { err("Usage: zip <archive> <files...>"); break; }
      try {
        execSync(`zip -r ${archive} ${files.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
        success("Zipped");
      } catch { err("zip failed"); }
      break;
    }

    case "unzip-cmd": case "unzip": {
      const archive = args[0];
      if (!archive) { err("Usage: unzip <archive>"); break; }
      try {
        execSync(`unzip ${archive}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("unzip failed"); }
      break;
    }

    case "tar-cmd": case "tar": {
      try {
        execSync(`tar ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("tar failed"); }
      break;
    }

    case "gzip-cmd": case "gzip": {
      const file = args[0];
      if (!file) { err("Usage: gzip <file>"); break; }
      try {
        execSync(`gzip -k ${file}`, { encoding: "utf-8" });
        success("Compressed");
      } catch { err("gzip failed"); }
      break;
    }

    // ===== ENCODING/MEDIA =====
    case "ffmpeg-cmd": case "ffmpeg": {
      try {
        execSync(`ffmpeg ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("ffmpeg not available"); }
      break;
    }

    case "convert-cmd": case "convert": {
      try {
        execSync(`convert ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("ImageMagick not available"); }
      break;
    }

    case "screenshot": case "scrot": {
      const file = args[0] || "screenshot.png";
      try {
        execSync(`scrot ${file}`, { encoding: "utf-8" });
        success(`Saved: ${file}`);
      } catch { err("scrot not available"); }
      break;
    }

    // ===== DATE/TIME =====
    case "timestamp": case "ts": {
      console.log(String(Date.now()));
      break;
    }

    case "date-iso": case "dateiso": {
      console.log(new Date().toISOString());
      break;
    }

    case "date-unix": case "dateunix": {
      console.log(Math.floor(Date.now() / 1000));
      break;
    }

    case "epoch": case "epoch-to-date": {
      const ts = args[0];
      if (!ts) { err("Usage: epoch <timestamp>"); break; }
      const date = new Date(parseInt(ts) * (ts.length === 10 ? 1000 : 1));
      console.log(date.toISOString());
      break;
    }

    case "now": case "datetime": {
      console.log(new Date().toString());
      break;
    }

    case "utc": case "utc-time": {
      console.log(new Date().toUTCString());
      break;
    }

    // ===== SYSTEM INFO =====
    case "cpuinfo": case "lscpu": {
      try {
        const out = execSync("lscpu", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("lscpu not available"); }
      break;
    }

    case "meminfo": case "lsmem": {
      try {
        const out = execSync("lsmem", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("lsmem not available"); }
      break;
    }

    case "lsblk": case "block-devices": {
      try {
        const out = execSync("lsblk", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("lsblk not available"); }
      break;
    }

    case "lspci": case "pci-devices": {
      try {
        const out = execSync("lspci", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("lspci not available"); }
      break;
    }

    case "lsusb": case "usb-devices": {
      try {
        const out = execSync("lsusb", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("lsusb not available"); }
      break;
    }

    case "hostname-cmd": case "hostname": {
      try {
        const out = execSync("hostname", { encoding: "utf-8" }).trim();
        console.log(chalk.green(out));
      } catch { err("hostname failed"); }
      break;
    }

    case "whoami-cmd": case "whoami": {
      try {
        const out = execSync("whoami", { encoding: "utf-8" }).trim();
        console.log(chalk.green(out));
      } catch { err("whoami failed"); }
      break;
    }

    case "uptime-cmd": case "uptime": {
      try {
        const out = execSync("uptime", { encoding: "utf-8" }).trim();
        console.log(chalk.green(out));
      } catch { err("uptime failed"); }
      break;
    }

    case "cal-cmd": case "cal": {
      try {
        const out = execSync(`cal ${args.join(" ")}`, { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("cal not available"); }
      break;
    }

    // ===== USER MANAGEMENT =====
    case "users-cmd": case "users-list": {
      try {
        const out = execSync("users", { encoding: "utf-8" }).trim();
        console.log(chalk.green(out || "No users"));
      } catch { err("users failed"); }
      break;
    }

    case "w-cmd": case "w-users": {
      try {
        const out = execSync("w", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("w not available"); }
      break;
    }

    case "last-cmd": case "last": {
      try {
        const out = execSync("last -10", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("last not available"); }
      break;
    }

    // ===== SERVICES =====
    case "systemctl-cmd": case "systemctl": {
      const action = args[0];
      const service = args[1];
      if (!action || !service) { err("Usage: systemctl <start|stop|restart|status> <service>"); break; }
      try {
        execSync(`sudo systemctl ${action} ${service}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("systemctl failed"); }
      break;
    }

    case "services": case "list-services": {
      try {
        const out = execSync("systemctl list-units --type=service --no-pager --no-legend", { encoding: "utf-8" });
        const rows = out.trim().split("\n").filter(Boolean).slice(0, 20).map(l => {
          const parts = l.trim().split(/\s+/);
          return [parts[0], parts[1], parts[2] || ""];
        });
        tableRender(["Unit", "Load", "Active"], rows, { headColor: "blue" });
      } catch { err("systemctl not available"); }
      break;
    }

    case "crontab-cmd": case "crontab": {
      const action = args[0];
      if (!action || action === "-l") {
        try {
          const out = execSync("crontab -l", { encoding: "utf-8" });
          console.log(chalk.gray(out || "No crontab"));
        } catch { console.log(chalk.gray("No crontab")); }
      } else if (action === "-e") {
        try {
          execSync("crontab -e", { encoding: "utf-8", stdio: "inherit" });
        } catch { err("crontab edit failed"); }
      } else {
        err("Usage: crontab [-l|-e]");
      }
      break;
    }

    case "cron": case "cron-jobs": {
      const cronDirs = ["/etc/cron.d", "/etc/cron.daily", "/etc/cron.hourly", "/etc/cron.monthly", "/etc/cron.weekly"];
      for (const dir of cronDirs) {
        if (existsSync(dir)) {
          try {
            const out = execSync(`ls -la ${dir}`, { encoding: "utf-8" });
            console.log(chalk.cyan(`${dir}:`));
            console.log(chalk.gray(out));
          } catch {}
        }
      }
      break;
    }

    // ===== PACKAGE MANAGERS =====
    case "apt-cmd": case "apt": {
      try {
        execSync(`apt ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("apt not available"); }
      break;
    }

    case "apt-list": case "apt-packages": {
      try {
        const out = execSync("dpkg -l | head -30", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("dpkg not available"); }
      break;
    }

    case "brew-cmd": case "brew": {
      try {
        execSync(`brew ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("brew not available"); }
      break;
    }

    case "pip-cmd": case "pip": {
      try {
        execSync(`pip ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("pip not available"); }
      break;
    }

    case "pip-list": case "pip-freeze": {
      try {
        const out = execSync("pip freeze 2>/dev/null | head -20", { encoding: "utf-8" });
        console.log(chalk.gray(out));
      } catch { err("pip not available"); }
      break;
    }

    case "cargo-cmd": case "cargo": {
      try {
        execSync(`cargo ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("cargo not available"); }
      break;
    }

    case "go-cmd": case "go": {
      try {
        execSync(`go ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" });
      } catch { err("go not available"); }
      break;
    }

    case "grep": case "rg": case "find": case "which": case "locate": case "fd":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); } break;
      
    case "awk": case "sed": case "sort": case "uniq": case "cut": case "tr": case "wc":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); } break;
      
    case "git": try { execSync(`git ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git", e); } break;
      
    case "git-status": case "gitst": {
      try {
        const status = execSync("git status --porcelain", { encoding: "utf-8" });
        const lines = status.trim().split("\n").filter(Boolean);
        if (lines.length === 0) {
          console.log(chalk.green("✓ Working tree clean"));
        } else {
          const rows = lines.map(l => {
            const col = l.slice(0, 2);
            const file = l.slice(3);
            let color = chalk.white;
            if (col.includes("M")) color = chalk.yellow;
            if (col.includes("A")) color = chalk.green;
            if (col.includes("D")) color = chalk.red;
            if (col.includes("?") && col === "??") color = chalk.gray;
            return [color(col), file];
          });
          tableRender(["Status", "File"], rows, { headColor: "yellow" });
        }
        const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
        const ahead = execSync("git rev-list --count @{u}..HEAD", { encoding: "utf-8" }).trim();
        const behind = execSync("git rev-list --count HEAD..@{u}", { encoding: "utf-8" }).trim();
        console.log(chalk.cyan(`\nBranch: ${branch}`) + (ahead !== "0" ? chalk.red(` ↓${ahead}`) : "") + (behind !== "0" ? chalk.green(` ↑${behind}`) : ""));
      } catch { err("Not a git repo"); }
      break;
    }

    case "git-branches": case "gitbr": {
      try {
        const branches = execSync("git branch -a --format='%(refname:short)|%(HEAD)|%(upstream:short)'", { encoding: "utf-8" });
        const rows = branches.trim().split("\n").filter(Boolean).map(b => {
          const [name, current, upstream] = b.split("|");
          return [current === "*" ? chalk.green("●") : " ", name, upstream || "-"];
        });
        tableRender(["", "Branch", "Upstream"], rows, { headColor: "cyan" });
      } catch { err("Not a git repo"); }
      break;
    }

    case "git-log": case "gitlog": {
      try {
        const log = execSync("git log --oneline -10 --format='%h|%s|%an|%ad'", { encoding: "utf-8" });
        const rows = log.trim().split("\n").filter(Boolean).map(l => {
          const [hash, msg, author, date] = l.split("|");
          return [chalk.yellow(hash), msg.slice(0, 40), chalk.gray(author), chalk.gray(date)];
        });
        tableRender(["Hash", "Message", "Author", "Date"], rows, { headColor: "magenta" });
      } catch { err("Not a git repo"); }
      break;
    }

    case "docker-ps": case "dps": {
      try {
        const ps = execSync("docker ps --format '{{.ID}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Names}}'", { encoding: "utf-8" });
        const rows = ps.trim().split("\n").filter(Boolean).map(l => {
          const [id, img, status, ports, name] = l.split("|");
          return [id.slice(0, 12), img.slice(0, 20), status.slice(0, 20), ports.slice(0, 25), name];
        });
        tableRender(["ID", "Image", "Status", "Ports", "Name"], rows, { headColor: "blue" });
      } catch { err("Docker not running"); }
      break;
    }

    case "docker-images": case "di": {
      try {
        const imgs = execSync("docker images --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}'", { encoding: "utf-8" });
        const rows = imgs.trim().split("\n").filter(Boolean).map(l => {
          const [id, repo, tag, size, created] = l.split("|");
          return [id.slice(0, 12), repo.slice(0, 25), tag, size, created.slice(0, 15)];
        });
        tableRender(["ID", "Repository", "Tag", "Size", "Created"], rows, { headColor: "blue" });
      } catch { err("Docker not running"); }
      break;
    }

    case "docker-stop-all": case "dstop": {
      try {
        execSync("docker ps -q | xargs docker stop", { encoding: "utf-8" });
        success("All containers stopped");
      } catch { err("Failed to stop containers"); }
      break;
    }

    case "docker-rm-all": case "drm": {
      try {
        execSync("docker ps -aq | xargs docker rm", { encoding: "utf-8" });
        success("All containers removed");
      } catch { err("Failed to remove containers"); }
      break;
    }

    case "k8s-pods": case "kgp": {
      try {
        const pods = execSync("kubectl get pods -o wide 2>/dev/null || kubectl get pods 2>/dev/null", { encoding: "utf-8" });
        console.log(chalk.cyan(pods));
      } catch { err("kubectl not configured"); }
      break;
    }

    case "k8s-svc": case "kgs": {
      try {
        const svc = execSync("kubectl get svc 2>/dev/null", { encoding: "utf-8" });
        console.log(chalk.cyan(svc));
      } catch { err("kubectl not configured"); }
      break;
    }

    case "k8s-nodes": case "kgn": {
      try {
        const nodes = execSync("kubectl get nodes 2>/dev/null", { encoding: "utf-8" });
        console.log(chalk.cyan(nodes));
      } catch { err("kubectl not configured"); }
      break;
    }

    case "http": case "curl-json": case "api": {
      const method = args[0]?.toUpperCase() || "GET";
      const url = args[1] || args[0];
      if (!url) {
        console.log(chalk.yellow("Usage: api <method> <url> [body]"));
        console.log(chalk.gray("  api GET https://api.example.com/users"));
        console.log(chalk.gray("  api POST https://api.example.com/users '{\"name\":\"John\"}'"));
        break;
      }
      const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
      if (!validMethods.includes(method)) {
        console.log(chalk.yellow(`Valid methods: ${validMethods.join(", ")}`));
        break;
      }
      const body = args[2] ? `-d '${args.slice(2).join(" ")}'` : "";
      const headers = args[2] ? "-H 'Content-Type: application/json'" : "-H 'Accept: application/json'";
      try {
        const start = Date.now();
        const out = execSync(`curl -s -w "\\n%{http_code}|%{time_total}" -X ${method} ${headers} ${body} "${url}"`, { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        const [bodyPart, status, time] = out.match(/([\s\S]*)\n(\d+)\|(.+)$/);
        const color = status.startsWith("2") ? chalk.green : status.startsWith("4") ? chalk.yellow : chalk.red;
        console.log(chalk.cyan(`\n${method} ${url}`));
        console.log(color(`Status: ${status}`) + chalk.gray(` (${parseFloat(time).toFixed(3)}s)`));
        try {
          const json = JSON.parse(bodyPart);
          console.log(JSON.stringify(json, null, 2));
        } catch { console.log(bodyPart); }
      } catch (e: any) { handleError("api", e); }
      break;
    }

    case "api-detect": case "api-scan": {
      info("Scanning for APIs...");
      const detected: string[] = [];
      const configs = [
        { file: "package.json", key: "scripts", api: "npm run" },
        { file: "docker-compose.yml", key: "services", api: "docker compose" },
        { file: "docker-compose.yaml", key: "services", api: "docker compose" },
        { file: "openapi.yaml", key: "openapi", api: "OpenAPI" },
        { file: "openapi.json", key: "openapi", api: "OpenAPI" },
        { file: ".env", key: "API_URL", api: "Environment" },
        { file: ".env.local", key: "API_URL", api: "Environment" },
        { file: "vercel.json", key: "routes", api: "Vercel" },
        { file: "next.config.js", key: "", api: "Next.js" },
        { file: "nuxt.config.ts", key: "", api: "Nuxt" },
      ];
      for (const cfg of configs) {
        if (existsSync(cfg.file)) {
          try {
            const content = readFileSync(cfg.file, "utf-8");
            let apiName = cfg.api;
            if (cfg.key) {
              const data = JSON.parse(content);
              if (cfg.key.includes(".")) {
                const keys = cfg.key.split(".");
                let val = data;
                for (const k of keys) val = val?.[k];
                if (val) apiName += ` (${Object.keys(val).length} endpoints)`;
              } else if (data[cfg.key]) {
                apiName += ` (${typeof data[cfg.key] === "object" ? Object.keys(data[cfg.key]).length : "found"})`;
              }
            }
            detected.push(`${chalk.green("✓")} ${cfg.file} - ${apiName}`);
          } catch { detected.push(`${chalk.yellow("?")} ${cfg.file}`); }
        }
      }
      console.log(chalk.cyan("\n📡 Detected APIs & Services:"));
      if (detected.length === 0) console.log(chalk.gray("  No config files found"));
      else detected.forEach(d => console.log("  " + d));
      
      console.log(chalk.cyan("\n🔗 Quick API Endpoints:"));
      console.log(chalk.gray("  Run 'api localhost:3000' to test local server"));
      console.log(chalk.gray("  Run 'api GET /users' with API_URL env set"));
      break;
    }

    case "api-services": case "api-presets": {
      const services = [
        ["github", "GitHub API", "https://api.github.com"],
        ["gitlab", "GitLab API", "https://gitlab.com/api/v4"],
        ["jira", "Jira API", process.env.JIRA_URL || "https://your-domain.atlassian.net/rest/api/3"],
        ["notion", "Notion API", "https://api.notion.com/v1"],
        ["stripe", "Stripe API", "https://api.stripe.com/v1"],
        ["twilio", "Twilio API", "https://api.twilio.com/2010-04-01"],
        ["sendgrid", "SendGrid API", "https://api.sendgrid.com/v3"],
        ["shopify", "Shopify Admin API", "https://your-store.myshopify.com/admin/api/2024-01"],
        ["linear", "Linear API", "https://api.linear.app/graphql"],
        ["openai", "OpenAI API", "https://api.openai.com/v1"],
        ["anthropic", "Anthropic API", "https://api.anthropic.com/v1"],
        ["replicate", "Replicate API", "https://api.replicate.com/v1"],
      ];
      const rows = services.map(([key, name, url]) => [chalk.cyan(key), name, chalk.gray(url.slice(0, 45) + (url.length > 45 ? "..." : ""))]);
      console.log(chalk.cyan("\n🌐 API Service Presets:"));
      tableRender(["Key", "Service", "Base URL"], rows, { headColor: "blue" });
      console.log(chalk.gray("\nUsage: api-service <service> <endpoint>"));
      console.log(chalk.gray("  api github /user"));
      console.log(chalk.gray("  api stripe /customers"));
      break;
    }

    case "api-service": case "api-preset": {
      const [service, ...rest] = args;
      const presets: Record<string, string> = {
        github: "https://api.github.com",
        gitlab: "https://gitlab.com/api/v4",
        notion: "https://api.notion.com/v1",
        stripe: "https://api.stripe.com/v1",
        openai: "https://api.openai.com/v1",
        anthropic: "https://api.anthropic.com/v1",
        replicate: "https://api.replicate.com/v1",
        jira: process.env.JIRA_URL || "https://your-domain.atlassian.net/rest/api/3",
        sendgrid: "https://api.sendgrid.com/v3",
        linear: "https://api.linear.app/graphql",
        shopify: "https://your-store.myshopify.com/admin/api/2024-01",
      };
      if (!service) {
        err("Usage: api-service <service> <endpoint> [method] [body]");
        console.log(chalk.gray("Services: " + Object.keys(presets).join(", ")));
        break;
      }
      const base = presets[service.toLowerCase()];
      if (!base) { err(`Unknown service: ${service}`); break; }
      const endpoint = rest[0]?.startsWith("/") ? rest[0] : "/" + (rest[0] || "");
      const method = (rest[1] || "GET").toUpperCase();
      const url = base + endpoint;
      console.log(chalk.cyan(`\n${method} ${service}:${endpoint}`));
      try {
        const start = Date.now();
        let opts = `-s -w "\\n%{http_code}|%{time_total}" -X ${method}`;
        if (process.env[`${service.toUpperCase()}_TOKEN`] || process.env[`${service.toUpperCase()}_API_KEY`]) {
          const token = process.env[`${service.toUpperCase()}_TOKEN`] || process.env[`${service.toUpperCase()}_API_KEY`];
          if (service === "github") opts += ` -H "Authorization: Bearer ${token}" -H "Accept: application/vnd.github.v3+json"`;
          else if (service === "openai" || service === "anthropic") opts += ` -H "Authorization: Bearer ${token}" -H "Content-Type: application/json"`;
          else if (service === "stripe") opts += ` -u ${token}:`;
          else opts += ` -H "Authorization: Bearer ${token}"`;
        }
        const out = execSync(`curl ${opts} "${url}"`, { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        const match = out.match(/([\s\S]*)\n(\d+)\|(.+)$/);
        if (match) {
          const [_, bodyPart, status, time] = match;
          const color = status.startsWith("2") ? chalk.green : status.startsWith("4") ? chalk.yellow : chalk.red;
          console.log(color(`Status: ${status}`) + chalk.gray(` (${parseFloat(time).toFixed(3)}s)`));
          try { console.log(JSON.stringify(JSON.parse(bodyPart), null, 2)); } 
          catch { console.log(bodyPart); }
        }
      } catch (e: any) { handleError("api-service", e); }
      break;
    }

    case "api-graphql": case "gql": {
      const [endpoint, query] = args;
      if (!endpoint || !query) {
        console.log(chalk.yellow("Usage: api-graphql <endpoint> <query>"));
        console.log(chalk.gray("  api-graphql https://api.github.com/graphql '{viewer{login}}'"));
        console.log(chalk.gray("  api-graphql https://api.linear.app/graphql '{me{id}}'"));
        break;
      }
      const url = endpoint.startsWith("http") ? endpoint : (process.env.API_URL || "http://localhost:3000") + endpoint;
      console.log(chalk.cyan(`\nPOST ${url}`));
      try {
        const start = Date.now();
        const out = execSync(`curl -s -w "\\n%{http_code}|%{time_total}" -X POST -H "Content-Type: application/json" -d '{"query":"'${query}'"}' "${url}"`, { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        const match = out.match(/([\s\S]*)\n(\d+)\|(.+)$/);
        if (match) {
          const [_, bodyPart, status, time] = match;
          const color = status.startsWith("2") ? chalk.green : chalk.red;
          console.log(color(`Status: ${status}`) + chalk.gray(` (${parseFloat(time).toFixed(3)}s)`));
          try { console.log(JSON.stringify(JSON.parse(bodyPart), null, 2)); } 
          catch { console.log(bodyPart); }
        }
      } catch (e: any) { handleError("graphql", e); }
      break;
    }

    case "api-history": case "apih": {
      const historyFile = join(CONFIG_DIR, "api_history.json");
      const history = loadJSON(historyFile, []);
      if (history.length === 0) {
        console.log(chalk.gray("No API history. Run some requests first!"));
        break;
      }
      console.log(chalk.cyan("\n📜 API Request History:"));
      const rows = history.slice(-10).reverse().map((h: any, i: number) => 
        [String(i + 1), chalk.yellow(h.method), h.url.slice(0, 40), chalk.gray(h.status || "-"), chalk.gray(h.time || "-")]
      );
      tableRender(["#", "Method", "URL", "Status", "Time"], rows, { headColor: "cyan" });
      break;
    }

    case "api-fav": case "api-save": {
      if (args.length < 2) {
        err("Usage: api-fav <name> <url> [method] [body]");
        break;
      }
      const [name, url, method = "GET", ...bodyParts] = args;
      const favsFile = join(CONFIG_DIR, "api_favorites.json");
      const favs = loadJSON(favsFile, {});
      favs[name] = { url, method, body: bodyParts.join(" ") };
      saveJSON(favsFile, favs);
      success(`Saved API favorite: ${name}`);
      break;
    }

    case "api-favs": case "api-favorites": {
      const favsFile = join(CONFIG_DIR, "api_favorites.json");
      const favs = loadJSON(favsFile, {});
      const favList = Object.entries(favs);
      if (favList.length === 0) {
        console.log(chalk.gray("No favorites. Save with: api-fav <name> <url>"));
        break;
      }
      console.log(chalk.cyan("\n⭐ API Favorites:"));
      const rows = favList.map(([name, f]: [string, any]) => 
        [chalk.yellow(name), chalk.blue(f.method), f.url.slice(0, 45)]
      );
      tableRender(["Name", "Method", "URL"], rows, { headColor: "yellow" });
      console.log(chalk.gray("\nRun: api-run <name>"));
      break;
    }

    case "api-run": case "apir": {
      if (!args[0]) { err("Usage: api-run <favorite-name>"); break; }
      const favsFile = join(CONFIG_DIR, "api_favorites.json");
      const favs = loadJSON(favsFile, {});
      const fav = favs[args[0]];
      if (!fav) { err(`Favorite not found: ${args[0]}`); break; }
      const start = Date.now();
      try {
        let opts = `-s -w "\\n%{http_code}|%{time_total}" -X ${fav.method}`;
        opts += ` -H "Content-Type: application/json"`;
        if (fav.body) opts += ` -d '${fav.body}'`;
        const out = execSync(`curl ${opts} "${fav.url}"`, { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        const match = out.match(/([\s\S]*)\n(\d+)\|(.+)$/);
        if (match) {
          const [_, bodyPart, status, time] = match;
          const color = status.startsWith("2") ? chalk.green : chalk.red;
          console.log(chalk.cyan(`${fav.method} ${fav.url}`));
          console.log(color(`Status: ${status}`) + chalk.gray(` (${parseFloat(time).toFixed(3)}s)`));
          try { console.log(JSON.stringify(JSON.parse(bodyPart), null, 2)); } 
          catch { console.log(bodyPart); }
        }
      } catch (e: any) { handleError("api-run", e); }
      break;
    }

    case "db-query": case "db": {
      if (!args[0]) {
        console.log(chalk.yellow("Usage: db <type> <query>"));
        console.log(chalk.gray("  db postgres 'SELECT * FROM users LIMIT 5'"));
        console.log(chalk.gray("  db mysql 'SHOW TABLES'"));
        console.log(chalk.gray("  db sqlite 'SELECT * FROM users'"));
        break;
      }
      const dbType = args[0].toLowerCase();
      const query = args.slice(1).join(" ");
      if (!query) { err("Query required"); break; }
      try {
        let cmd = "";
        if (dbType === "postgres" || dbType === "psql") cmd = `psql -c "${query}"`;
        else if (dbType === "mysql") cmd = `mysql -e "${query}"`;
        else if (dbType === "sqlite") cmd = `sqlite3 "${query}"`;
        else { err("Unknown DB: postgres, mysql, sqlite"); break; }
        const out = execSync(cmd, { encoding: "utf-8" });
        console.log(out);
      } catch (e: any) { handleError("db", e, "Check connection"); }
      break;
    }

    case "s3-ls": {
      try {
        const out = execSync("aws s3 ls 2>/dev/null || s3cmd ls 2>/dev/null", { encoding: "utf-8" });
        const rows = out.trim().split("\n").filter(Boolean).map(l => {
          const parts = l.trim().split(/\s+/);
          return [parts[0], parts[1], parts.slice(2).join(" ")];
        });
        tableRender(["Date", "Time", "Bucket"], rows, { headColor: "yellow" });
      } catch { err("AWS CLI not configured"); }
      break;
    }

    case "s3-copy": case "s3cp": {
      if (args.length < 2) { err("Usage: s3cp <src> <dest>"); break; }
      try {
        execSync(`aws s3 cp "${args[0]}" "${args[1]}"`, { encoding: "utf-8", stdio: "inherit" });
        success("Copied");
      } catch { err("Copy failed"); }
      break;
    }

    case "env-list": case "envls": {
      try {
        const out = execSync("env | sort", { encoding: "utf-8" });
        const rows = out.trim().split("\n").map(l => {
          const [key, ...val] = l.split("=");
          return [chalk.cyan(key), val.join("=").slice(0, 50)];
        });
        tableRender(["Variable", "Value"], rows, { headColor: "green" });
      } catch { err("Failed to list env"); }
      break;
    }

    case "env-get": {
      if (!args[0]) { err("Usage: env-get <KEY>"); break; }
      console.log(chalk.cyan(`${args[0]}=`) + (process.env[args[0]] || ""));
      break;
    }

    case "env-set": {
      if (args.length < 2) { err("Usage: env-set <KEY> <value>"); break; }
      process.env[args[0]] = args.slice(1).join(" ");
      success(`Set ${args[0]}`);
      break;
    }

    case "secret-ls": case "secrets": {
      try {
        const vault = execSync("vault secrets list 2>/dev/null || echo 'Vault not available'", { encoding: "utf-8" });
        if (vault.includes("not available")) {
          console.log(chalk.yellow("Vault not available. Showing .env files:"));
          const files = execSync("find . -maxdepth 2 -name '.env*' -type f 2>/dev/null | head -10", { encoding: "utf-8" });
          console.log(chalk.gray(files || "No .env files found"));
        } else {
          console.log(vault);
        }
      } catch { console.log(chalk.gray("No secrets manager available")); }
      break;
    }
       
    case "status": case "branches": case "brr": case "graph": case "log": case "diff":
      try { execSync(`git ${cmd === "brr" ? "branch" : cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git", e); } break;
      
    case "commit": case "gc": case "gcm":
      if (!args[0]) err("Usage: commit <message>");
      else try { execSync(`git add . && git commit -m "${args.join(" ")}"`, { encoding: "utf-8" }); success("Committed!"); }
      catch (e: any) { handleError("git commit", e, "Nothing to commit?"); } break;
      
    case "push": case "gp":
      try { execSync("git push", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git push", e, "Check remote/auth"); } break;
      
    case "pull": case "gpl": case "gl":
      try { execSync("git pull", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git pull", e); } break;
      
    case "checkout": case "co": case "gco":
      if (!args[0]) err("Usage: checkout <branch>");
      else try { execSync(`git checkout "${args[0]}"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git checkout", e, "Branch may not exist"); } break;
      
    case "add": case "ga": case "gaa":
      try { execSync(`git add ${cmd === "gaa" ? "." : args[0] || "."}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git add", e); } break;
      
    case "ask": case "ai":
      if (!args[0]) { err("Usage: ask <question>"); break; }
      info("🤖 Thinking...");
      try { const out = execSync(`${OPENCODE_PATH} run "${args.join(" ").replace(/"/g, '\\"')}"`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }); console.log(chalk.cyan("🤖 ") + out); }
      catch (e: any) { handleError("AI", e); } break;
      
    case "opencode-ai": case "opencode":
      console.clear();
      info("🚀 Launching OpenCode AI...\n");
      try { 
        spawn(OPENCODE_PATH, [], { stdio: "inherit", cwd: process.cwd() }).on("close", () => {
          console.clear(); console.log(logo()); info("Returned to DevMate\n"); prompt();
        });
      } catch (e: any) { handleError("opencode", e, "Install opencode"); prompt(); }
      return true;

    case "table": {
      if (!args[0]) {
        console.log(chalk.yellow("Usage: table <headers> <rows>"));
        console.log(chalk.gray("  table Name,Age City 'John,25|Jane,30'"));
        break;
      }
      try {
        const headers = args[0].split(',');
        const rowData = args[1]?.split('|').map(r => r.split(',')) || [];
        tableRender(headers, rowData);
      } catch (e: any) { err("Invalid table format"); }
      break;
    }

    case "chart": {
      if (!args[0]) {
        console.log(chalk.yellow("Usage: chart <data> [options]"));
        console.log(chalk.gray("  chart 10,20,15,30 --title Sales --color green"));
        break;
      }
      try {
        const data = args[0].split(',').map(Number);
        const titleIdx = args.indexOf('--title');
        const colorIdx = args.indexOf('--color');
        chartRender(data, {
          title: titleIdx > -1 ? args[titleIdx + 1] : undefined,
          color: colorIdx > -1 ? args[colorIdx + 1] : 'green'
        });
      } catch (e: any) { err("Invalid chart data"); }
      break;
    }

    case "md": 
    case "markdown": {
      if (!args[0]) { err("Usage: md <file>"); break; }
      try {
        const content = readFileSync(args[0], 'utf-8');
        mdRender(content);
      } catch (e: any) { handleError("md", e, "File not found"); }
      break;
    }

    case "progress": {
      if (!args[0] || !args[1]) {
        console.log(chalk.yellow("Usage: progress <current> <total>"));
        console.log(chalk.gray("  progress 50 100"));
        break;
      }
      console.log(progressBar(parseInt(args[0]), parseInt(args[1])));
      break;
    }

    case "jsonfmt": {
      if (!args[0]) { err("Usage: jsonfmt <file>"); break; }
      try {
        const content = readFileSync(args[0], 'utf-8');
        console.log(JSON.stringify(JSON.parse(content), null, 2));
      } catch (e: any) { handleError("jsonfmt", e, "Invalid JSON"); }
      break;
    }

    case "npm": case "yarn": case "pnpm": case "bun": case "npx":
    case "pip": case "pip3": case "pipx": case "poetry": case "pipenv": case "conda":
    case "go": case "cargo": case "rustc":
    case "apt": case "apt-get": case "dnf": case "yum": case "pacman": case "zypper":
    case "brew": case "snap": case "flatpak": case "pkg": case "apk":
    case "docker": case "kubectl": case "helm": case "k9s":
    case "aws": case "gcloud": case "az": case "terraform": case "pulumi": case "ansible":
    case "winget": case "scoop": case "choco": case "podman":
    case "convert": case "ffmpeg": case "scrot": case "feh": case "rclone":
    case "chmod": case "chown": case "chgrp":
    case "curl": case "wget": case "ssh": case "scp": case "rsync": case "sftp":
    case "ping": case "dig": case "nslookup": case "traceroute": case "mtr": case "nmap":
    case "netstat": case "ss": case "ip": case "ifconfig":
    case "tar": case "zip": case "unzip": case "gzip": case "gunzip": case "bzip2": case "xz": case "7z": case "rar":
    case "md5sum": case "sha256sum": case "sha512sum": case "base64": case "gpg": case "openssl": case "ssh-keygen":
    case "sudo": case "su":
    case "whoami": case "who": case "w": case "id": case "users": case "groups": case "last":
    case "date": case "cal": case "ncal": case "sleep": case "timedatectl":
    case "crontab": case "at": case "anacron":
    case "systemctl": case "service": case "journalctl": case "dmesg": case "loginctl":
    case "ps": case "top": case "htop": case "btop": case "glances": case "atop": case "bashtop": case "bpytop":
    case "kill": case "killall": case "pkill": case "bg": case "fg": case "jobs": case "nice": case "renice":
    case "free": case "df": case "du": case "dmidecode": case "lshw": case "lscpu": case "lsblk": case "blkid":
    case "uptime": case "uname": case "hostname": case "hostnamectl":
    case "mount": case "umount": case "fsck": case "mkfs": case "dd":
    case "code": case "vim": case "nano": case "emacs": case "subl": case "zed": case "helix":
    case "node": case "deno": case "python": case "python3": case "ruby": case "perl": case "php": case "lua": case "r": case "julia":
    case "eslint": case "tsc": case "prettier": case "biome": case "rome": case "stylelint":
    case "vite": case "webpack": case "rollup": case "esbuild": case "parcel": case "snowpack":
    case "jest": case "vitest": case "mocha": case "pytest": case "unittest": case "rspec": case "minitest": case "tap":
    case "pm2": case "forever": case "nodemon": case "supervisor": case "systemd":
    case "docker-compose": case "docker compose": case "dockerfile":
    case "make": case "cmake": case "ninja": case "meson": case "gradle": case "maven": case "sbt": case "ant":
    case "fortune": case "cowsay": case "sl": case "cmatrix": case "neofetch": case "pfetch": case "screenfetch": case "pfetch":
    case "tmux": case "screen": case "byobu":
    case "zsh": case "fish": case "bash": case "xonsh":
    case "starship": case "ohmyzsh": case "ohmyposh": case "powerlevel10k":
    case "fzf": case "ripgrep": case "bat": case "eza": case "exa": case "lsd": case "colorls":
    case "httpie": case "axel": case "aria2": case "you-get": case "yt-dlp":
    case "rclone":
    case "mysql": case "mariadb": case "postgresql": case "postgres": case "sqlite": case "mongodb": case "redis":
    case "nginx": case "apache": case "caddy": case "traefik": case "haproxy": case "envoy":
    case "pass": case "bitwarden": case "1password": case "keepassxc": case "gopass": case "vault":
    case "sops": case "age": case "gocryptfs": case "veracrypt":
    case "act":
    case "k9s": case "kubenav": case "lens": case "octant": case "devspace":
    case "skaffold": case "tilt": case "kubectl-debug": case "ksniff":
    case "kompose": case "kopf": case "kubeval": case "datree": case "checkov": case "terrascan":
    case "kustomize": case "helmfile":
    case "prometheus": case "grafana": case "alertmanager": case "thanos": case "mimir":
    case "loki": case "promtail": case "fluentd": case "fluent-bit": case "elasticsearch": case "logstash": case "kibana":
    case "jaeger": case "zipkin": case "opentelemetry": case "skywalking":
    case "istio": case "linkerd": case "nginx-ingress":
    case "calico": case "flannel": case "cilium": case "weave":
    case "rook": case "longhorn": case "portworx":
    case "kafka": case "rabbitmq": case "activemq": case "nats": case "pulsar":
    case "heroku": case "vercel": case "netlify": case "cloudflare": case "aws-amplify": case "render":
    case "railway": case "fly": case "dokku": case "coolify": case "caprover":
    case "clear": case "cls":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); }
      break;
      
    case "fortune": try { console.log(execSync("fortune", { encoding: "utf-8" })); } 
      catch { handleError("fortune", {message: "not found"}, "sudo apt install fortune-mod"); } break;
    case "cowsay": try { console.log(execSync(`cowsay "${args.join(" ")}"`, { encoding: "utf-8" })); } 
      catch { handleError("cowsay", {message: "not found"}, "sudo apt install cowsay"); } break;
    case "sl": try { execSync("sl", { encoding: "utf-8", stdio: "inherit" }); } 
      catch { handleError("sl", {message: "not found"}, "sudo apt install sl"); } break;
    case "cmatrix": try { execSync("cmatrix", { encoding: "utf-8", stdio: "inherit" }); } 
      catch { handleError("cmatrix", {message: "not found"}, "sudo apt install cmatrix"); } break;
    case "neofetch": case "pfetch": case "screenfetch":
      try { execSync(cmd, { encoding: "utf-8", stdio: "inherit" }); }
      catch { handleError(cmd, {message: "not found"}, `sudo apt install ${cmd}`); } break;
      
    case "chess": case "2048": case "snake": case "tetris": case "minesweeper": case "ninvaders": case "pacman4console":
      warn(`Play '${cmd}': sudo apt install ${cmd}`); break;
      
    case "exit": case "quit": case "q": case "x": case "e": case "bye":
      console.log(chalk.yellow("\n👋 Goodbye!")); return true;
      
    case "env": case "printenv":
      try { console.log(execSync(cmd, { encoding: "utf-8" })); } catch {} break;
    case "export":
      if (!args[0]) err("Usage: export VAR=value");
      else { const [k, ...v] = args[0].split("="); process.env[k] = v.join("="); success(`Exported: ${k}`); } 
      break;
      
    case "copy": case "paste": case "xcopy":
      if (cmd === "copy" && !args[0]) err("Usage: copy <text>");
      else try { execSync(cmd === "copy" ? `echo "${args.join(" ")}" | xclip -selection clipboard` : "xclip -selection clipboard -o", { stdio: "inherit" }); }
      catch { handleError(cmd, {message: "xclip not found"}, "sudo apt install xclip"); } 
      break;
      
    case "alias":
      if (!args[0]) {
        console.log(chalk.cyan("Aliases:"));
        Object.entries(allAliases).forEach(([k, v]) => console.log(`  ${chalk.green(k)} -> ${v}`));
      } else if (args[0] === "add" && args.length >= 3) {
        aliasesCustom[args[1]] = args.slice(2).join(" "); saveAll(); success(`Alias: ${args[1]} -> ${args.slice(2).join(" ")}`);
      } else if (args[0] === "del" && args[1]) {
        delete aliasesCustom[args[1]]; saveAll(); success(`Deleted alias: ${args[1]}`);
      } else if (args[0] === "list") {
        console.log(chalk.cyan("Custom Aliases:"));
        Object.entries(aliasesCustom).forEach(([k, v]) => console.log(`  ${chalk.green(k)} -> ${v}`));
      } else if (args[0] === "help") {
        console.log("alias add <name> <cmd> | del <name> | list");
      }
      break;
      
    case "cmd": case "custom":
      if (!args[0]) {
        console.log(chalk.cyan("Custom Commands:"));
        Object.entries(customCommands).forEach(([n, c]) => console.log(`  ${chalk.green(n)} -> ${c}`));
        if (!Object.keys(customCommands).length) console.log(chalk.gray("cmd add <name> <cmd>"));
      } else if (args[0] === "add" && args.length >= 3) {
        customCommands[args[1]] = args.slice(2).join(" "); saveAll(); success(`Added: ${args[1]}`);
      } else if (args[0] === "del" && args[1]) {
        delete customCommands[args[1]]; saveAll(); success(`Deleted: ${args[1]}`);
      } else if (args[0] === "list" || args[0] === "ls") {
        console.log(chalk.cyan("Custom Commands:"));
        Object.entries(customCommands).forEach(([n, c]) => console.log(`  ${chalk.green(n)} -> ${c}`));
      }
      break;
    
    case "htop": case "btop": case "bashtop": case "bpytop": case "glances": case "atop": case "btop":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e, `Install: apt install ${cmd}`); }
      break;
    case "lazygit":
      try { execSync(`lazygit ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lazygit", e, "Install: apt install lazygit"); }
      break;
    case "lazydocker":
      try { execSync(`lazydocker ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lazydocker", e, "Install: apt install lazydocker"); }
      break;
    case "yazi": case "lf": case "ranger": case "vifm":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); }
      break;
    case "eza": case "exa":
      try { execSync(`eza ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("eza", e, "Install: apt install eza"); }
      break;
    case "bat": case "batcat":
      try { execSync(`bat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bat", e, "Install: apt install bat"); }
      break;
    case "fd": case "fdfind":
      try { execSync(`fd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fd", e, "Install: apt install fd-find"); }
      break;
    case "ripgrep": case "rg":
      try { execSync(`rg ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rg", e, "Install: apt install ripgrep"); }
      break;
    case "delta": case "git-delta":
      try { execSync(`delta ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("delta", e, "Install: cargo install delta"); }
      break;
    case "tldr":
      try { execSync(`tldr ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tldr", e, "Install: apt install tldr"); }
      break;
    case "cheat":
      try { execSync(`cheat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cheat", e, "Install: pip install cheat"); }
      break;
    case "httpie": case "ht":
      try { execSync(`http ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("httpie", e, "Install: pip install httpie"); }
      break;
    case "dog":
      try { execSync(`dog ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dog", e, "Install: cargo install dog"); }
      break;
    case "dust": case "duf": case "ncdu":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); }
      break;
    case "zoxide": case "z":
      try { execSync(`zoxide ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zoxide", e, "Install: curl -sS https://get.oh-my.zsh | | sh"); }
      break;
    case "starship":
      try { execSync(`starship ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("starship", e, "Install: curl -sS https://starship.rs/install.sh | sh"); }
      break;
    case "fzf":
      try { execSync(`fzf ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fzf", e, "Install: apt install fzf"); }
      break;
    case "fira-code": case "jetbrains": case "meslo": case "nerd-fonts":
      console.log(chalk.cyan("Visit: https://www.nerdfonts.com/font-downloads"));
      break;
    case "k9s":
      try { execSync(`k9s ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("k9s", e, "Install: brew install k9s"); }
      break;
    case "stern":
      try { execSync(`stern ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("stern", e, "Install: brew install stern"); }
      break;
    case "kubectx": case "kubens":
      try { execSync(`kubectx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kubectx", e, "Install: brew install kubectx"); }
      break;
    case "kustomize": case "kpt": case "helmfile":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); }
      break;
    case "skaffold": case "tilt": case "devspace":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); }
      break;
    case "postgres": case "psql":
      try { execSync(`psql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("psql", e, "Install: apt install postgresql"); }
      break;
    case "mongosh": case "mongocli":
      try { execSync(`mongosh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mongosh", e, "Install: apt install mongodb-org-shell"); }
      break;
    case "redis-cli":
      try { execSync(`redis-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("redis-cli", e, "Install: apt install redis-tools"); }
      break;
    case "mysql":
      try { execSync(`mysql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mysql", e, "Install: apt install mysql-client"); }
      break;
    case "sqlite3":
      try { execSync(`sqlite3 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sqlite3", e, "Install: apt install sqlite3"); }
      break;
    case "influx": case "influxd":
      try { execSync(`influx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("influx", e); }
      break;
    case "timescaledb": case "timescale":
      console.log(chalk.cyan("TimescaleDB: ") + "timescale.com");
      break;
    case "cockroach": case "cockroachdb":
      try { execSync(`cockroach ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cockroach", e); }
      break;
    case "pnpm":
      try { execSync(`pnpm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pnpm", e, "Install: npm install -g pnpm"); }
      break;
    case "bun":
      try { execSync(`bun ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bun", e, "Install: curl -fsSL https://bun.sh/install | bash"); }
      break;
    case "deno":
      try { execSync(`deno ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("deno", e, "Install: curl -fsSL https://deno.land/install.sh | sh"); }
      break;
    case "uv": case "ruff":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e, `Install: pip install ${cmd}`); }
      break;
    case "airbyte": case "fivetran":
      console.log(chalk.cyan("Use web UI: ") + "airbyte.com");
      break;
    case "dbt":
      try { execSync(`dbt ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dbt", e, "Install: pip install dbt"); }
      break;
    case "prisma":
      try { execSync(`prisma ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("prisma", e, "Install: npm install -g prisma"); }
      break;
    case "hasura":
      try { execSync(`hasura ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hasura", e); }
      break;
    case "apollostudio": case "apollo":
      console.log(chalk.cyan("Apollo GraphOS: ") + "apollographql.com");
      break;
    case "serverless": case "sls":
      try { execSync(`serverless ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("serverless", e, "Install: npm install -g serverless"); }
      break;
    case "sam": case "cdk":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); }
      break;
    case "amplify":
      try { execSync(`amplify ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("amplify", e, "Install: npm install -g @aws-amplify/cli"); }
      break;
    case "cloudflare": case "cf":
      try { execSync(`cloudflare ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cloudflare", e, "Install: npm install -g cloudflare"); }
      break;
    case "fly": case "flyctl":
      try { execSync(`flyctl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flyctl", e, "Install: curl -L https://fly.io/install.sh | sh"); }
      break;
    case "railway": case "render": case "vercel": case "netlify":
      console.log(chalk.cyan(`Use web UI: `) + `${cmd}.com`);
      break;
    case "supabase":
      try { execSync(`supabase ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("supabase", e, "Install: npm install -g supabase"); }
      break;
    case "appwrite":
      try { execSync(`appwrite ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("appwrite", e); }
      break;
    case "n8n": case "buffalo": case "strapi": case "keystone":
      console.log(chalk.cyan(`Use: `) + `npx create-${cmd}-app`);
      break;
    case "refine": case "refine-dev":
      try { execSync(`refine ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("refine", e); }
      break;
    case "payload": case "payloadcms":
      try { execSync(`payload ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("payload", e); }
      break;
    case "directus":
      try { execSync(`directus ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("directus", e); }
      break;
    case "forest": case "forestadmin":
      console.log(chalk.cyan("Use: ") + "forestadmin.com");
      break;
    case "budibase": case "nocodb": case "rowy":
      console.log(chalk.cyan(`Use web UI or: `) + `npx ${cmd}`);
      break;
    case "cal.com": case "schedule": case "calendso":
      console.log(chalk.cyan("Cal.com: ") + "cal.com");
      break;
    case "shadcn": case "shadcn-ui":
      console.log(chalk.cyan("Use: ") + "npx shadcn-ui@latest init");
      break;
    case "radix": case "headlessui": case "chakra": case "mantine": case "shoelace":
      console.log(chalk.cyan(`Use: npm install @${cmd}/ui`));
      break;
    case "tanstack": case "react-query": case "rtk-query":
      console.log(chalk.cyan(`Use: npm install @tanstack/${cmd.replace("react-query", "query").replace("rtk-query", "query")}`));
      break;
    case "zustand": case "jotai": case "recoil": case "valtio": case "xstate":
      console.log(chalk.cyan(`Use: npm install ${cmd}`));
      break;
    case "trpc": case "graphql-yoga": case "nexus": case "typegraphql":
      console.log(chalk.cyan(`Use: npm install ${cmd}`));
      break;
    case "prismajs": case "graphql-playground": case "graphiql":
      console.log(chalk.cyan(`Use: npm install ${cmd}`));
      break;
    case "urql": case "apollo-client": case "relay":
      console.log(chalk.cyan(`Use: npm install ${cmd}`));
      break;
    case "remix": case "remix-run":
      try { execSync(`npx create-remix@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("remix", e); }
      break;
    case "next": case "nextjs":
      try { execSync(`npx create-next-app@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("next", e); }
      break;
    case "nuxt": case "nuxtjs":
      try { execSync(`nuxi init ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nuxt", e); }
      break;
    case "sveltekit": case "svelte":
      try { execSync(`npm create svelte@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("svelte", e); }
      break;
    case "astro":
      try { execSync(`npm create astro@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("astro", e); }
      break;
    case "qwik": case "qwikcity":
      try { execSync(`npm create qwik@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("qwik", e); }
      break;
    case "solidstart": case "solid":
      try { execSync(`npx degit solidjs/templates/ts ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("solid", e); }
      break;
    case "fresh": case "deno":
      try { execSync(`deno run -A -r https://fresh.deno.dev ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fresh", e); }
      break;
    case "redwood": case "redwoodjs":
      try { execSync(`npx create-redwood-app@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("redwood", e); }
      break;
    case "blitz": case "blitzjs":
      try { execSync(`npm install -g blitz && blitz new ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("blitz", e); }
      break;
    case "nexus": case "graphql-nexus":
      console.log(chalk.cyan("Use: npm install nexus graphql"));
      break;
    case "urql": case "urql-core":
      console.log(chalk.cyan("Use: npm install @urql/svelte"));
      break;
    case "vike": case "vite-plugin-ssr":
      try { execSync(`npm create vike@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vike", e); }
      break;
    case "solid-start":
      console.log(chalk.cyan("Use: npm create solid"));
      break;
    case "vite-node": case "vite-ts":
      try { execSync(`npm create vite@latest ${args.join(" ")} -- --template ${cmd === "vite-node" ? "node-ts" : "vue-ts"}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vite", e); }
      break;
    case "nest":
      try { execSync(`npm i -g @nestjs/cli && nest new ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nest", e); }
      break;
    case "adonis": case "adonisjs":
      try { execSync(`npm i -g @adonisjs/cli && adonis new ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("adonis", e); }
      break;
    case "feathers": case "hapi": case "loopback":
      console.log(chalk.cyan(`Use: npm install ${cmd}`));
      break;
    case "fastify":
      try { execSync(`npm init fastify ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fastify", e); }
      break;
    case "express": case "expressjs":
      try { execSync(`npx express-generator ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("express", e); }
      break;
    case "koa":
      try { execSync(`npx koa-generator ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("koa", e); }
      break;
    case "strapi":
      try { execSync(`npx create-strapi-app@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("strapi", e); }
      break;
    case "keystone":
      try { execSync(`npm create keystone-app@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("keystone", e); }
      break;
    case "blitz":
      try { execSync(`npm install -g blitz && blitz new ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("blitz", e); }
      break;

    case "snippet":
      if (!args[0]) {
        console.log(chalk.cyan("Snippets:"));
        Object.entries(snippets).forEach(([n, c]) => console.log(`  ${chalk.green(n)}: ${c}`));
        if (!Object.keys(snippets).length) console.log(chalk.gray("snippet add <name> <code>"));
      } else if (args[0] === "add" && args.length >= 3) {
        snippets[args[1]] = args.slice(2).join(" "); saveAll(); success(`Snippet added: ${args[1]}`);
      } else if (args[0] === "run" && args[1] && snippets[args[1]]) {
        try { execSync(snippets[args[1]], { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("snippet", e); }
      } else if (args[0] === "del" && args[1]) {
        delete snippets[args[1]]; saveAll(); success(`Deleted: ${args[1]}`);
      }
      break;
      
    case "bookmark": case "bookmarks":
      if (!args[0]) {
        console.log(chalk.cyan("Bookmarks:"));
        Object.entries(bookmarks).forEach(([n, p]) => console.log(`  ${chalk.green(n)}: ${p}`));
        if (!Object.keys(bookmarks).length) console.log(chalk.gray("bookmark add <name> <path>"));
      } else if (args[0] === "add" && args.length >= 2) {
        bookmarks[args[1]] = args.slice(2).join(" ") || process.cwd(); saveAll(); success(`Bookmark added: ${args[1]}`);
      } else if (args[0] === "cd" && args[1] && bookmarks[args[1]]) {
        try { process.chdir(bookmarks[args[1]]); success(`Changed to: ${bookmarks[args[1]]}`); }
        catch (e: any) { handleError("bookmark", e); }
      } else if (args[0] === "del" && args[1]) {
        delete bookmarks[args[1]]; saveAll(); success(`Deleted: ${args[1]}`);
      }
      break;
      
    case "session":
      const sessDir = join(CONFIG_DIR, "sessions");
      if (!args[0]) { console.log(chalk.gray("session save|load|list|delete <name>")); }
      else if (args[0] === "save" && args[1]) {
        mkdirSync(sessDir, { recursive: true });
        const data = { cwd: process.cwd(), time: Date.now(), env: process.env };
        writeFileSync(join(sessDir, `${args[1]}.json`), JSON.stringify(data, null, 2));
        success(`Session '${args[1]}' saved`);
      } else if (args[0] === "load" && args[1]) {
        try {
          const s = JSON.parse(readFileSync(join(sessDir, `${args[1]}.json`), "utf-8"));
          process.chdir(s.cwd);
          success(`Loaded: ${s.cwd}`);
        } catch { err(`Session '${args[1]}' not found`); }
      } else if (args[0] === "list" || args[0] === "ls") {
        try { console.log(execSync(`ls -la ${sessDir}`, { encoding: "utf-8" })); }
        catch { console.log(chalk.gray("No sessions")); }
      } else if (args[0] === "delete" && args[1]) {
        try { execSync(`rm -rf "${join(sessDir, args[1])}"`); success(`Deleted: ${args[1]}`); }
        catch { err("Failed to delete"); }
      }
      break;
      
    case "run": case "dev": case "build": case "test": case "lint": case "format":
    case "start": case "stop": case "restart": case "debug": case "serve":
      const pm = existsSync("yarn.lock") ? "yarn" : existsSync("pnpm-lock.yaml") ? "pnpm" : "npm";
      const scripts: Record<string, string> = { run: "start", dev: "dev", build: "build", test: "test", lint: "lint", format: "format", start: "start", stop: "stop", restart: "restart", debug: "debug", serve: "serve" };
      const script = scripts[cmd];
      try { execSync(`${pm} run ${script}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e, `npm run ${script} may not exist`); }
      break;
      
    case "sys": case "system": case "info":
      try {
        const cpu = execSync("cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d: -f2", { encoding: "utf-8" }).trim();
        const mem = execSync("free -h", { encoding: "utf-8" }).trim();
        const disk = execSync("df -h / | tail -1", { encoding: "utf-8" }).trim();
        const uptime = execSync("uptime -p", { encoding: "utf-8" }).trim();
        console.log(chalk.bold.cyan("📊 System Info"));
        console.log(chalk.green("CPU:") + cpu);
        console.log(chalk.blue("Memory:"));
        console.log(mem);
        console.log(chalk.yellow("Disk:"));
        console.log(disk);
        console.log(chalk.magenta("Uptime:") + uptime);
      } catch (e: any) { handleError("sys", e); }
      break;
      
    case "ports":
      try { console.log(execSync("ss -tulanp", { encoding: "utf-8" })); }
      catch (e: any) { handleError("ports", e); }
      break;
      
    case "packages": case "pkgs":
      const pkgCmds = [
        ["dpkg -l", "apt"], ["rpm -qa", "dnf/yum"], ["pacman -Qq", "pacman"], ["zypper se -i", "zypper"],
        ["brew list", "brew"], ["npm list -g --depth=0", "npm"], ["pip list", "pip"]
      ];
      for (const [c] of pkgCmds) {
        try { const out = execSync(c, { encoding: "utf-8" }); 
          console.log(chalk.cyan(`\n${c.split(" ")[0]}: `)); console.log(out.substring(0, 500)); 
        } catch {}
      }
      break;
      
    // ============ GITHUB INTEGRATION ============
    case "gh":
      try { execSync(`gh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh", e, "Install: https://cli.github.com"); }
      break;
    case "gh-pr": case "ghpr":
      try { execSync(`gh pr ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh pr", e); }
      break;
    case "gh-issue": case "ghissue":
      try { execSync(`gh issue ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh issue", e); }
      break;
    case "gh-run": case "ghrun":
      try { execSync(`gh run ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh run", e); }
      break;
      
    // ============ GITLAB ============
    case "glab":
      try { execSync(`glab ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("glab", e, "Install: https://gitlab.com/gitlab-org/cli"); }
      break;
      
    // ============ DATABASE TOOLS ============
    case "mysql": case "mariadb":
      try { execSync(`mysql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mysql", e, "sudo apt install mysql-client"); }
      break;
    case "psql": case "postgres":
      try { execSync(`psql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("psql", e, "sudo apt install postgresql-client"); }
      break;
    case "mongosh": case "mongo":
      try { execSync(`mongosh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mongosh", e, "Install MongoDB Shell"); }
      break;
    case "redis-cli":
      try { execSync(`redis-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("redis-cli", e, "sudo apt install redis-tools"); }
      break;
    case "sqlite3":
      try { execSync(`sqlite3 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sqlite3", e); }
      break;
    case "mysql-workbench": case "dbeaver":
      warn("GUI tool - run from desktop or install: sudo apt install dbeaver"); 
      break;
      
    // ============ DOCKER ENHANCED ============
    case "docker-build": case "dbuild":
      if (!args[0]) err("Usage: docker-build <image>")
      else try { execSync(`docker build -t ${args[0]} .`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker build", e); }
      break;
    case "docker-run": case "drun":
      if (!args[0]) err("Usage: docker-run <image>")
      else try { execSync(`docker run -it ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker run", e); }
      break;
    case "docker-logs": case "dlogs":
      if (!args[0]) err("Usage: docker-logs <container>")
      else try { execSync(`docker logs -f ${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker logs", e); }
      break;
    case "docker-exec": case "dexec":
      if (args.length < 2) err("Usage: docker-exec <container> <command>")
      else try { execSync(`docker exec -it ${args[0]} ${args.slice(1).join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker exec", e); }
      break;
    case "docker-clean": case "dclean":
      try { execSync("docker system prune -af", { encoding: "utf-8", stdio: "inherit" }); success("Docker cleaned!"); }
      catch (e: any) { handleError("docker clean", e); }
      break;
    case "docker-stats": case "dstats":
      try { execSync("docker stats --no-stream", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker stats", e); }
      break;
      
    // ============ KUBERNETES ENHANCED ============
    case "k-get": case "kg": try { execSync(`kubectl get ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl", e); } break;
    case "k-describe": case "kd": try { execSync(`kubectl describe ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl", e); } break;
    case "k-logs": case "klog": if (!args[0]) err("Usage: k-logs <pod>"); else try { execSync(`kubectl logs -f ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl logs", e); } break;
    case "k-exec": case "kexec": if (args.length < 2) err("Usage: k-exec <pod> <cmd>"); else try { execSync(`kubectl exec -it ${args[0]} -- ${args.slice(1).join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl exec", e); } break;
    case "k-port-forward": case "kpf": if (args.length < 2) err("Usage: k-port-forward <pod> <port>"); else try { execSync(`kubectl port-forward ${args[0]} ${args[1]}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl port-forward", e); } break;
    case "k-forward": case "kfw": if (args.length < 2) err("Usage: k-forward <service> <port>"); else try { execSync(`kubectl port-forward svc/${args[0]} ${args[1]}:${args[1]}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl forward", e); } break;
    case "k-contexts": case "kctxs": try { execSync("kubectl config get-contexts", { encoding: "utf-8" }); } catch (e: any) { handleError("kubectl", e); } break;
    case "k-namespaces": case "kns": try { execSync("kubectl get namespaces", { encoding: "utf-8" }); } catch (e: any) { handleError("kubectl", e); } break;
    case "k-all": case "kall": try { execSync("kubectl get all --all-namespaces", { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl", e); } break;
    case "k-events": case "kev": try { execSync("kubectl get events --sort-by='.lastTimestamp'", { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl", e); } break;
    case "k-top": case "ktop": try { execSync("kubectl top nodes", { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl top", e, "kubectl top requires metrics-server"); } break;
    case "k-debug": case "kdbg": try { execSync(`kubectl debug ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("kubectl debug", e); } break;
      
    // ============ CLOUD CLI ============
    case "aws-s3": case "s3": try { execSync(`aws s3 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("aws s3", e); } break;
    case "aws-ec2": case "ec2": try { execSync(`aws ec2 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("aws ec2", e); } break;
    case "aws-lambda": case "lambda": try { execSync(`aws lambda ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("aws lambda", e); } break;
    case "gcloud-compute": case "gcompute": try { execSync(`gcloud compute ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("gcloud compute", e); } break;
    case "gcloud-k8s": case "gk8s": try { execSync(`gcloud container ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("gcloud container", e); } break;
    case "az-vm": case "azvm": try { execSync(`az vm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("az vm", e); } break;
    case "az-aks": case "aks": try { execSync(`az aks ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("az aks", e); } break;
    case "az-func": case "afunc": try { execSync(`az functionapp ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("az functionapp", e); } break;
      
    // ============ MONITORING ============
    case "htop": try { execSync("htop", { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("htop", {message: "not found"}, "sudo apt install htop"); } break;
    case "btop": case "bashtop": case "bpytop":
      try { execSync(cmd, { encoding: "utf-8", stdio: "inherit" }); } catch { handleError(cmd, {message: "not found"}, `sudo apt install ${cmd}`); } break;
    case "glances": try { execSync("glances", { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("glances", {message: "not found"}, "pip install glances"); } break;
    case "atop": try { execSync("atop", { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("atop", {message: "not found"}, "sudo apt install atop"); } break;
    case "iotop": try { execSync("iotop", { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("iotop", {message: "not found"}, "sudo apt install iotop"); } break;
    case "nmon": try { execSync("nmon", { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("nmon", {message: "not found"}, "sudo apt install nmon"); } break;
    case "dstat": try { execSync(`dstat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("dstat", {message: "not found"}, "sudo apt install dstat"); } break;
    case "sar": try { execSync(`sar ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("sar", {message: "not found"}, "sudo apt install sysstat"); } break;
      
    // ============ NETWORK TOOLS ============
    case "nmap": 
      if (!args[0]) err("Usage: nmap <target>");
      else try { execSync(`nmap ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch (e: any) { handleError("nmap", e); }
      break;
    case "netcat": case "nc":
      try { execSync(`nc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("nc", {message: "not found"}, "sudo apt install netcat-openbsd"); } break;
    case "socat": try { execSync(`socat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); } catch { handleError("socat", {message: "not found"}, "sudo apt install socat"); } break;
    case "curl-ip": try { console.log(execSync("curl ifconfig.me", { encoding: "utf-8" })); } catch { handleError("curl", e); } break;
    case "speedtest": 
      try { execSync("speedtest-cli", { encoding: "utf-8", stdio: "inherit" }); } 
      catch { handleError("speedtest", {message: "not found"}, "pip install speedtest-cli"); } 
      break;
    case "http-server": case "httpserver":
      try { execSync(`npx http-server ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("http-server", e, "npx http-server -p 8080"); }
      break;
    case "python-server": case "pyserver":
      const port = args[0] || "8000";
      try { execSync(`python3 -m http.server ${port}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("python server", e); }
      break;
    case "php-server": case "phpserver":
      try { execSync(`php -S localhost:${args[0] || "8000"}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("php server", e); }
      break;
    case "serve": 
      try { execSync(`npx serve ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("serve", e, "npx serve -s"); }
      break;
    case "localtunnel": case "lt":
      try { execSync(`npx localtunnel ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("localtunnel", e, "npx localtunnel --port 3000"); }
      break;
    case "ngrok":
      try { execSync(`ngrok ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ngrok", e, "Download from ngrok.com"); }
      break;
    case "cloudflared": case "cflared":
      try { execSync(`cloudflared ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cloudflared", e); }
      break;
      
    // ============ FILE TOOLS ============
    case "encrypt": case "gpg-encrypt":
      if (args.length < 2) err("Usage: encrypt <file> <recipient>");
      else try { execSync(`gpg -e -r ${args[1]} "${args[0]}"`); success(`Encrypted: ${args[0]}.gpg`); }
      catch (e: any) { handleError("gpg encrypt", e); }
      break;
    case "decrypt": case "gpg-decrypt":
      if (!args[0]) err("Usage: decrypt <file>");
      else try { execSync(`gpg -d "${args[0]}"`); }
      catch (e: any) { handleError("gpg decrypt", e); }
      break;
    case "hash": case "hash-file":
      if (!args[0]) err("Usage: hash <file>");
      else {
        try {
          const md5 = execSync(`md5sum "${args[0]}"`, { encoding: "utf-8" }).split(" ")[0];
          const sha256 = execSync(`sha256sum "${args[0]}"`, { encoding: "utf-8" }).split(" ")[0];
          console.log(chalk.cyan(`MD5:    ${md5}`));
          console.log(chalk.cyan(`SHA256: ${sha256}`));
        } catch (e: any) { handleError("hash", e); }
      }
      break;
    case "checksum": case "verify":
      if (args.length < 2) err("Usage: verify <file> <hash>");
      else {
        try {
          const hash = execSync(`sha256sum "${args[0]}"`, { encoding: "utf-8" }).split(" ")[0];
          if (hash === args[1]) success("✓ Checksum verified!");
          else err("✗ Checksum mismatch!");
        } catch (e: any) { handleError("verify", e); }
      }
      break;
    case "backup":
      if (!args[0]) err("Usage: backup <file|dir>");
      else {
        const name = args[0] + ".backup." + Date.now() + ".tar.gz";
        try { execSync(`tar -czf "${name}" "${args[0]}"`); success(`Backed up to: ${name}`); }
        catch (e: any) { handleError("backup", e); }
      }
      break;
      
    // ============ QUICK TEMPLATES ============
    case "template": case "tmpl":
      if (!args[0]) {
        console.log(chalk.cyan("Quick Templates:"));
        console.log("  react <name>     - React component");
        console.log("  vue <name>       - Vue component");
        console.log("  express <name>   - Express API");
        console.log("  next <name>      - Next.js app");
        console.log("  lambda <name>   - AWS Lambda");
        console.log("  dockerfile       - Dockerfile");
        console.log("  github-action    - GitHub Action");
      }
      break;
    case "template-react": case "tmpl-react":
      if (!args[0]) err("Usage: template react <name>");
      else {
        const name = args[0];
        const code = `import React from 'react';\n\nexport default function ${name}() {\n  return (\n    <div>${name}</div>\n  );\n}`;
        writeFileSync(`${name}.jsx`, code);
        success(`Created: ${name}.jsx`);
      }
      break;
    case "template-dockerfile": case "tmpl-docker":
      const dockerfile = `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]`;
      writeFileSync("Dockerfile", dockerfile);
      success("Created: Dockerfile");
      break;
    case "template-github-action": case "tmpl-gh":
      const ghaction = `name: CI\non: [push, pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n      - run: npm ci\n      - run: npm test`;
      mkdirSync(".github/workflows", { recursive: true });
      writeFileSync(".github/workflows/ci.yml", ghaction);
      success("Created: .github/workflows/ci.yml");
      break;
      
    // ============ PROJECT SCAFFOLDING ============
    case "new": case "create": case "scaffold":
      if (!args[0]) {
        console.log(chalk.cyan("Scaffold:"));
        console.log("  new node <name>      - Node.js project");
        console.log("  new react <name>     - React app");
        console.log("  new next <name>      - Next.js app");
        console.log("  new express <name>   - Express API");
        console.log("  new python <name>    - Python project");
        console.log("  new go <name>       - Go project");
        console.log("  new rust <name>      - Rust project");
      }
      break;
    case "new-node":
      if (!args[0]) err("Usage: new node <name>");
      else {
        try {
          execSync(`mkdir -p ${args[0]} && cd ${args[0]} && npm init -y`);
          success(`Created Node.js project: ${args[0]}`);
        } catch (e: any) { handleError("new node", e); }
      }
      break;
    case "new-react":
      try { execSync(`npx create-react-app ${args[0] || "my-app"}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("new react", e, "npx create-react-app <name>"); }
      break;
    case "new-next":
      try { execSync(`npx create-next-app ${args[0] || "my-app"} --typescript`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("new next", e, "npx create-next-app <name>"); }
      break;
    case "new-python":
      if (!args[0]) err("Usage: new python <name>");
      else {
        try {
          execSync(`mkdir -p ${args[0]} && cd ${args[0]} && echo "# ${args[0]}" > README.md && echo 'print("Hello World")' > main.py`);
          success(`Created Python project: ${args[0]}`);
        } catch (e: any) { handleError("new python", e); }
      }
      break;
    case "new-go":
      try { 
        if (args[0]) execSync(`mkdir -p ${args[0]} && cd ${args[0]} && go mod init ${args[0]}`, { encoding: "utf-8", stdio: "inherit" });
        else execSync("go mod init my-module", { encoding: "utf-8", stdio: "inherit" });
      }
      catch (e: any) { handleError("new go", e); }
      break;
    case "new-rust":
      try { execSync(`cargo new ${args[0] || "my-project"}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("new rust", e); }
      break;
      
    // ============ QUICK ACTIONS ============
    case "ip": 
      try { console.log(chalk.cyan("Public: " + execSync("curl -s ifconfig.me", { encoding: "utf-8" }).trim())); }
      catch {}
      try { console.log(chalk.cyan("Local: " + execSync("hostname -I", { encoding: "utf-8" }).trim())); }
      catch {}
      break;
    case "weather":
      try { execSync(`curl -s "wttr.in?format=3"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch { handleError("weather", e, "curl wttr.in"); }
      break;
    case "short": case "url-short":
      if (!args[0]) err("Usage: short <url>");
      else try { console.log(execSync(`curl -s -o /dev/null -w "%{url_effective}\n" -L --post301 --post302 --post303 -J -L ${args[0]}`, { encoding: "utf-8" })); } catch { handleError("shorten", e); }
      break;
    case "qr": case "qrcode":
      if (!args[0]) err("Usage: qr <text|url>");
      else try { execSync(`echo "${args.join(" ")}" | qrencode -o - -t UTF8`, { encoding: "utf-8", stdio: "inherit" }); }
      catch { handleError("qr", {message: "qrencode not found"}, "sudo apt install qrencode"); }
      break;
    case "passgen": case "password":
      const len = parseInt(args[0]) || 16;
      try { console.log(execSync(`openssl rand -base64 ${len}`, { encoding: "utf-8" }).trim()); }
      catch { console.log(Math.random().toString(36).slice(-len)); }
      break;
    case "timestamp":
      console.log(chalk.cyan("Unix: ") + Math.floor(Date.now() / 1000));
      console.log(chalk.cyan("ISO:  ") + new Date().toISOString());
      console.log(chalk.cyan("UTC:  ") + new Date().toUTCString());
      break;
    case "convert-date": case "date-convert":
      if (!args[0]) err("Usage: convert-date <timestamp>");
      else {
        const d = new Date(parseInt(args[0]) * (args[0].length === 10 ? 1000 : 1));
        console.log(chalk.cyan("ISO: ") + d.toISOString());
        console.log(chalk.cyan("UTC: ") + d.toUTCString());
        console.log(chalk.cyan("Local: ") + d.toLocaleString());
      }
      break;
    case "base64-decode": case "b64d":
      if (!args[0]) err("Usage: b64d <encoded>");
      else try { console.log(Buffer.from(args[0], "base64").toString("utf-8")); } catch (e: any) { handleError("base64 decode", e); }
      break;
    case "base64-encode": case "b64e":
      if (!args[0]) err("Usage: b64e <text>");
      else try { console.log(Buffer.from(args.join(" ")).toString("base64")); } catch (e: any) { handleError("base64 encode", e); }
      break;
    case "url-encode": case "urle":
      console.log(encodeURIComponent(args.join(" ")));
      break;
    case "url-decode": case "urld":
      console.log(decodeURIComponent(args.join(" ")));
      break;
    case "json-format": case "jsonf":
      try { console.log(JSON.stringify(JSON.parse(args.join(" ")), null, 2)); }
      catch (e: any) { handleError("json format", e, "Valid JSON required"); }
      break;
    case "json-minify": case "jsonm":
      try { console.log(JSON.stringify(JSON.parse(args.join(" ")))); }
      catch (e: any) { handleError("json minify", e, "Valid JSON required"); }
      break;
    case "uuid":
      console.log("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : ((r & 0x3 | 0x8).toString(16)));
      }));
      break;
    case "hex": case "to-hex":
      console.log(Buffer.from(args.join(" ")).toString("hex"));
      break;
    case "from-hex":
      console.log(Buffer.from(args[0], "hex").toString("utf-8"));
      break;
      
    // ============ GIT ENHANCED ============
    case "git-init": case "ginit":
      try { execSync("git init"); success("Git initialized!"); }
      catch (e: any) { handleError("git init", e); }
      break;
    case "git-clone": case "gclone":
      if (!args[0]) err("Usage: git-clone <url>");
      else try { execSync(`git clone ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git clone", e); }
      break;
    case "git-undo": case "gundo":
      try { execSync("git reset --soft HEAD~1"); success("Undone last commit (staged)"); }
      catch (e: any) { handleError("git undo", e); }
      break;
    case "git-clean": case "gclean":
      try { execSync("git clean -fd"); success("Cleaned untracked files!"); }
      catch (e: any) { handleError("git clean", e); }
      break;
    case "git-force": case "gforce":
      if (!args[0]) err("Usage: git-force <branch>");
      else try { execSync(`git reset --hard origin/${args[0]}`); success(`Reset to origin/${args[0]}`); }
      catch (e: any) { handleError("git force", e); }
      break;
    case "git-prune": case "gprune":
      try { execSync("git fetch --prune && git branch -vv | grep ': gone]' | awk '{print $1}' | xargs -r git branch -d"); success("Pruned deleted branches!"); }
      catch (e: any) { handleError("git prune", e); }
      break;
    case "git-contributors": case "gcontrib":
      try { execSync("git shortlog -sn --all", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git contributors", e); }
      break;
    case "git-changes": case "gchanges":
      try { execSync("git diff --stat", { encoding: "utf-8" }); }
      catch (e: any) { handleError("git changes", e); }
      break;
    case "git-ignored": case "gignored":
      try { execSync("git check-ignore *", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git ignored", e); }
      break;
      
    // ============ SYSTEM ENHANCED ============
    case "services": case "svcs":
      try { execSync("systemctl list-units --type=service --state=running", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("services", e); }
      break;
    case "failed": case "failed-services":
      try { execSync("systemctl list-units --failed", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("failed", e); }
      break;
    case "listen": case "ports-open":
      try { execSync("ss -tulnp", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("listen", e); }
      break;
    case "limits": case "ulimits":
      try { execSync("ulimit -a", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("limits", e); }
      break;
    case "syslog": 
      try { execSync(`tail -n 100 /var/log/syslog`, { encoding: "utf-8" }); }
      catch { try { execSync(`journalctl -n 100`, { encoding: "utf-8" }); } catch (e: any) { handleError("syslog", e); } }
      break;
    case "errors": 
      try { execSync(`dmesg | tail -50`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("errors", e); }
      break;
    case "disk-io": case "iostat":
      try { execSync("iostat -xz 1 3", { encoding: "utf-8", stdio: "inherit" }); }
      catch { handleError("iostat", {message: "not found"}, "sudo apt install sysstat"); }
      break;
    case "memory-details": case "meminfo":
      try { execSync("cat /proc/meminfo", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("meminfo", e); }
      break;
    case "cpu-info":
      try { execSync("lscpu", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cpu-info", e); }
      break;
    case "pci":
      try { execSync("lspci", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pci", e); }
      break;
    case "usb":
      try { execSync("lsusb", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("usb", e); }
      break;
    case "devices":
      try { execSync("lsblk -o NAME,SIZE,TYPE,MOUNTPOINT", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("devices", e); }
      break;
      
    // ============ QUICK SERVER ============
    case "server": case "srv":
      const port2 = args[0] || "3000";
      try { execSync(`npx serve -p ${port2}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("server", e, `npx serve -p ${port2}`); }
      break;
    case "json-server": case "jsonsrv":
      try { execSync(`npx json-server --watch db.json --port ${args[0] || "3000"}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("json-server", e, "npx json-server"); }
      break;
    case "nodemon": 
      try { execSync(`nodemon ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nodemon", e, "npm install -g nodemon"); }
      break;
    case "ts-node":
      try { execSync(`ts-node ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ts-node", e, "npm install -g ts-node"); }
      break;
    case "tsx":
      try { execSync(`tsx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tsx", e, "npm install -g tsx"); }
      break;
    case "bun-run": case "brun":
      try { execSync(`bun ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bun", e); }
      break;
    case "deno-run": case "drun":
      try { execSync(`deno ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("deno", e); }
      break;
      
    // ============ CONTAINER REGISTRIES ============
    case "docker-push": case "dpush":
      if (!args[0]) err("Usage: docker-push <image>");
      else try { execSync(`docker push ${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker push", e); }
      break;
    case "docker-pull": case "dpull":
      if (!args[0]) err("Usage: docker-pull <image>");
      else try { execSync(`docker pull ${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker pull", e); }
      break;
    case "docker-tag": case "dtag":
      if (args.length < 2) err("Usage: docker-tag <source> <target>");
      else try { execSync(`docker tag ${args[0]} ${args[1]}`, { encoding: "utf-8" }); success("Tagged!"); }
      catch (e: any) { handleError("docker tag", e); }
      break;
    case "docker-image-ls": case "dimages":
      try { execSync("docker images", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker images", e); }
      break;
    case "docker-rmi": case "drmi":
      if (!args[0]) err("Usage: docker-rmi <image>");
      else try { execSync(`docker rmi ${args[0]}`, { encoding: "utf-8" }); success("Removed image!"); }
      catch (e: any) { handleError("docker rmi", e); }
      break;
    case "docker-prune": case "dprune":
      try { execSync("docker image prune -af", { encoding: "utf-8", stdio: "inherit" }); success("Pruned!"); }
      catch (e: any) { handleError("docker prune", e); }
      break;
      
    // ============ SEARCH ENHANCED ============
    case "search": case "find-content":
      if (args.length < 1) err("Usage: search <pattern>");
      else try { execSync(`grep -rn "${args.join(" ")}" . --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" --include="*.py" --include="*.go"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("search", e); }
      break;
    case "find-ext": case "finde":
      if (args.length < 2) err("Usage: find-ext <ext> <name>");
      else try { execSync(`find . -name "*${args[1]}*.${args[0]}"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("find-ext", e); }
      break;
    case "find-big": case "findbig":
      try { execSync("find . -type f -exec du -h {} + | sort -rh | head -20", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("find-big", e); }
      break;
    case "find-old": case "findold":
      try { execSync(`find . -type f -mtime +30 -ls`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("find-old", e); }
      break;

    // ============ MESSAGING & SOCIAL ============
    case "telegram":
      if (!args[0]) err("Usage: telegram <message> or telegram -f <file> or telegram -s <chat_id> <message>");
      else {
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
          err("Telegram not configured", "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars");
        } else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${msg}"`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("telegram", e); }
        }
      }
      break;
    case "telegram-file": case "telegramf":
      if (!args[0]) err("Usage: telegram-file <file>");
      else {
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
          err("Telegram not configured", "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars");
        } else {
          try { execSync(`curl -s -F document=@"${args[0]}" "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument?chat_id=${TELEGRAM_CHAT_ID}"`, { encoding: "utf-8" }); success("File sent!"); }
          catch (e: any) { handleError("telegram-file", e); }
        }
      }
      break;
    case "telegram-bot": case "tgb":
      if (!args[0]) err("Usage: telegram-bot <command> [args]");
      else {
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (!TELEGRAM_BOT_TOKEN) { err("Set TELEGRAM_BOT_TOKEN env var"); }
        else {
          try { execSync(`curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${args.join("_")}"`, { encoding: "utf-8", stdio: "inherit" }); }
          catch (e: any) { handleError("telegram-bot", e); }
        }
      }
      break;
    case "discord": case "discord-msg":
      if (!args[0]) err("Usage: discord <message> or discord -w <webhook_url> <message>");
      else {
        const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
        if (!DISCORD_WEBHOOK) {
          err("Discord not configured", "Set DISCORD_WEBHOOK env var or use -w flag");
        } else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s -X POST -H "Content-Type: application/json" -d '{"content":"'${msg}'"}' "${DISCORD_WEBHOOK}"`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("discord", e); }
        }
      }
      break;
    case "discord-webhook":
      if (!args[0]) err("Usage: discord-webhook <webhook_url> <message>");
      else if (!args[1]) err("Usage: discord-webhook <webhook_url> <message>");
      else {
        const msg = encodeURIComponent(args.slice(1).join(" "));
        try { execSync(`curl -s -X POST -H "Content-Type: application/json" -d '{"content":"'${msg}'"}' "${args[0]}"`, { encoding: "utf-8" }); success("Message sent!"); }
        catch (e: any) { handleError("discord-webhook", e); }
      }
      break;
    case "discord-bot": case "dcbot":
      if (!args[0]) err("Usage: discord-bot <subcommand> [args]");
      else {
        const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
        if (!DISCORD_BOT_TOKEN) { err("Set DISCORD_BOT_TOKEN env var"); }
        else {
          try { execSync(`curl -s -H "Authorization: Bot ${DISCORD_BOT_TOKEN}" "https://discord.com/api/v10/${args.join("/")}"`, { encoding: "utf-8", stdio: "inherit" }); }
          catch (e: any) { handleError("discord-bot", e); }
        }
      }
      break;
    case "discord-channel": case "dcchan":
      if (!args[0]) err("Usage: discord-channel <channel_id> <message>");
      else if (!args[1]) err("Usage: discord-channel <channel_id> <message>");
      else {
        const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
        if (!DISCORD_BOT_TOKEN) { err("Set DISCORD_BOT_TOKEN env var"); }
        else {
          const msg = encodeURIComponent(args.slice(1).join(" "));
          try { execSync(`curl -s -X POST -H "Authorization: Bot ${DISCORD_BOT_TOKEN}" -H "Content-Type: application/json" -d '{"content":"'${msg}'"}' "https://discord.com/api/v10/channels/${args[0]}/messages"`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("discord-channel", e); }
        }
      }
      break;
    case "slack":
      if (!args[0]) err("Usage: slack <message> or slack -c <channel> <message>");
      else {
        const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
        if (!SLACK_WEBHOOK) {
          err("Slack not configured", "Set SLACK_WEBHOOK env var");
        } else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "text=${msg}" "${SLACK_WEBHOOK}"`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("slack", e); }
        }
      }
      break;
    case "slack-webhook":
      if (!args[0]) err("Usage: slack-webhook <webhook_url> <message>");
      else if (!args[1]) err("Usage: slack-webhook <webhook_url> <message>");
      else {
        const msg = encodeURIComponent(args.slice(1).join(" "));
        try { execSync(`curl -s -X POST -d "text=${msg}" "${args[0]}"`, { encoding: "utf-8" }); success("Message sent!"); }
        catch (e: any) { handleError("slack-webhook", e); }
      }
      break;
    case "slack-bot": case "slack-api":
      if (!args[0]) err("Usage: slack-bot <subcommand> [args]");
      else {
        const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
        if (!SLACK_BOT_TOKEN) { err("Set SLACK_BOT_TOKEN env var"); }
        else {
          try { execSync(`curl -s -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" -H "Content-Type: application/json" -X POST -d '${JSON.stringify({ text: args.slice(1).join(" ") })}' "https://slack.com/api/${args[0]}"`, { encoding: "utf-8", stdio: "inherit" }); }
          catch (e: any) { handleError("slack-bot", e); }
        }
      }
      break;
    case "whatsapp": case "wa":
      if (!args[0]) err("Usage: whatsapp <message> or whatsapp -s <number> <message>");
      else {
        const WA_API = process.env.WHATSAPP_API_URL;
        const WA_TOKEN = process.env.WHATSAPP_TOKEN;
        if (!WA_API || !WA_TOKEN) {
          warn("Using pywhatkit fallback...");
          try { execSync(`python3 -c "import pywhatkit; pywhatkit.sendwhatmsg_instantly('${args.join(" ")}')"`, { encoding: "utf-8", stdio: "inherit" }); }
          catch (e: any) { handleError("whatsapp", e, "pip install pywhatkit or set WHATSAPP_API_URL and WHATSAPP_TOKEN"); }
        } else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s -X POST "${WA_API}/messages" -H "Authorization: Bearer ${WA_TOKEN}" -H "Content-Type: application/json" -d '{"messaging_product":"whatsapp","to":"'${args[0]}'","type":"text","text":{"body":"'${msg}'"}}'`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("whatsapp", e); }
        }
      }
      break;
    case "whatsapp-send": case "was":
      if (!args[0]) err("Usage: whatsapp-send <number> <message>");
      else if (!args[1]) err("Usage: whatsapp-send <number> <message>");
      else {
        const WA_API = process.env.WHATSAPP_API_URL;
        const WA_TOKEN = process.env.WHATSAPP_TOKEN;
        if (!WA_API || !WA_TOKEN) { err("Set WHATSAPP_API_URL and WHATSAPP_TOKEN env vars"); }
        else {
          const msg = encodeURIComponent(args.slice(1).join(" "));
          try { execSync(`curl -s -X POST "${WA_API}/messages" -H "Authorization: Bearer ${WA_TOKEN}" -H "Content-Type: application/json" -d '{"messaging_product":"whatsapp","to":"'${args[0]}'","type":"text","text":{"body":"'${msg}'"}}'`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("whatsapp-send", e); }
        }
      }
      break;
    case "messenger": case "fb-msg":
      if (!args[0]) err("Usage: messenger <message> or messenger -p <page_id> <message>");
      else {
        const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
        if (!FB_PAGE_TOKEN) { err("Set FB_PAGE_TOKEN env var"); }
        else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s "https://graph.facebook.com/v18.0/me/messages?access_token=${FB_PAGE_TOKEN}" -X POST -H "Content-Type: application/json" -d '{"message":{"text":"'${msg}'"}}'`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("messenger", e); }
        }
      }
      break;
    case "facebook-post": case "fb-post":
      if (!args[0]) err("Usage: facebook-post <message> or facebook-post -p <page_id> <message>");
      else {
        const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
        if (!FB_PAGE_TOKEN) { err("Set FB_PAGE_TOKEN env var"); }
        else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s "https://graph.facebook.com/v18.0/me/feed?access_token=${FB_PAGE_TOKEN}" -X POST -H "Content-Type: application/json" -d '{"message":"'${msg}'"}'`, { encoding: "utf-8" }); success("Posted!"); }
          catch (e: any) { handleError("facebook-post", e); }
        }
      }
      break;
    case "twitter-post": case "x-post": case "tweet":
      if (!args[0]) err("Usage: twitter-post <message>");
      else {
        const TWITTER_BEARER = process.env.TWITTER_BEARER_TOKEN;
        const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
        const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET;
        const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
        if (!TWITTER_BEARER || !TWITTER_API_KEY) {
          err("Twitter not configured", "Set TWITTER_BEARER_TOKEN, TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN");
        } else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s -X POST "https://api.twitter.com/2/tweets" -H "Authorization: Bearer ${TWITTER_BEARER}" -H "Content-Type: application/json" -d '{"text":"'${msg}'"}'`, { encoding: "utf-8" }); success("Tweet posted!"); }
          catch (e: any) { handleError("twitter-post", e); }
        }
      }
      break;
    case "tiktok-post": case "tt-post":
      if (!args[0]) err("Usage: tiktok-post <video_file> --caption <caption>");
      else {
        const TIKTOK_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;
        if (!TIKTOK_TOKEN) { err("Set TIKTOK_ACCESS_TOKEN env var"); }
        else {
          try { execSync(`curl -s -X POST "https://open.tiktokapis.com/v2/post/publish/video/init/" -H "Authorization: Bearer ${TIKTOK_TOKEN}" -H "Content-Type: application/json" -d '{"upload_url":"'${args[0]}'","caption":"'${args.slice(1).join(" ")}"}'`, { encoding: "utf-8" }); success("Video queued for upload!"); }
          catch (e: any) { handleError("tiktok-post", e); }
        }
      }
      break;
    case "groupme":
      if (!args[0]) err("Usage: groupme <message>");
      else {
        const GROUPME_GROUP_ID = process.env.GROUPME_GROUP_ID;
        const GROUPME_BOT_ID = process.env.GROUPME_BOT_ID;
        if (!GROUPME_BOT_ID) { err("Set GROUPME_BOT_ID env var"); }
        else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s -X POST "https://api.groupme.com/v3/bots/post" -H "Content-Type: application/json" -d '{"bot_id":"'${GROUPME_BOT_ID}'","text":"'${msg}'"}'`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("groupme", e); }
        }
      }
      break;
    case "manychat":
      if (!args[0]) err("Usage: manychat <message> or manychat -f <flow> <user_id>");
      else {
        const MANYCHAT_API_KEY = process.env.MANYCHAT_API_KEY;
        if (!MANYCHAT_API_KEY) { err("Set MANYCHAT_API_KEY env var"); }
        else {
          const msg = encodeURIComponent(args.join(" "));
          try { execSync(`curl -s -X POST "https://api.manychat.com/fb/sending/sendMessage" -H "Content-Type: application/json" -d '{"api_key":"'${MANYCHAT_API_KEY}','body":{"message":"'${msg}'"}}'`, { encoding: "utf-8" }); success("Message sent!"); }
          catch (e: any) { handleError("manychat", e); }
        }
      }
      break;
    case "manychat-flow": case "mcf":
      if (!args[0]) err("Usage: manychat-flow <flow_name> <user_id>");
      else if (!args[1]) err("Usage: manychat-flow <flow_name> <user_id>");
      else {
        const MANYCHAT_API_KEY = process.env.MANYCHAT_API_KEY;
        if (!MANYCHAT_API_KEY) { err("Set MANYCHAT_API_KEY env var"); }
        else {
          try { execSync(`curl -s -X POST "https://api.manychat.com/fb/sending/sendFlow" -H "Content-Type: application/json" -d '{"api_key":"'${MANYCHAT_API_KEY}','flow_name":"'${args[0]}'","user_id":"'${args[1]}'"}'`, { encoding: "utf-8" }); success("Flow triggered!"); }
          catch (e: any) { handleError("manychat-flow", e); }
        }
      }
      break;
    case "send": case "notify":
      if (!args[0]) err("Usage: send <service> <message> (telegram, discord, slack, whatsapp)");
      else {
        const service = args[0].toLowerCase();
        const msg = args.slice(1).join(" ");
        if (!msg) err("Message required");
        else if (service === "telegram") {
          const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
          const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
          if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) err("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
          else { execSync(`curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(msg)}"`, { encoding: "utf-8" }); success("Sent!"); }
        } else if (service === "discord") {
          const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
          if (!DISCORD_WEBHOOK) err("Set DISCORD_WEBHOOK");
          else { execSync(`curl -s -X POST -H "Content-Type: application/json" -d '{"content":"'${encodeURIComponent(msg)}'"}' "${DISCORD_WEBHOOK}"`, { encoding: "utf-8" }); success("Sent!"); }
        } else if (service === "slack") {
          const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
          if (!SLACK_WEBHOOK) err("Set SLACK_WEBHOOK");
          else { execSync(`curl -s -X POST -d "text=${encodeURIComponent(msg)}" "${SLACK_WEBHOOK}"`, { encoding: "utf-8" }); success("Sent!"); }
        } else err("Unknown service: telegram, discord, slack, whatsapp");
      }
      break;
    case "msg": case "message":
      const services = { tg: "telegram", dc: "discord", sl: "slack", wa: "whatsapp", fb: "messenger", x: "twitter-post", tt: "tiktok-post" };
      if (!args[0] || !services[args[0].toLowerCase() as keyof typeof services]) {
        err(`Usage: msg <service> <message>`);
        console.log(chalk.gray(`Services: ${Object.keys(services).join(", ")}`));
      } else {
        const service = services[args[0].toLowerCase() as keyof typeof services];
        const msg = args.slice(1).join(" ");
        const fullCmd = `${service} ${msg}`;
        try { execSync(fullCmd, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("msg", e); }
      }
      break;
    case "imessage": case "ios-msg":
      if (!args[0]) err("Usage: imessage <message> or imessage -r <recipient> <message>");
      else {
        try { execSync(`osascript -e 'tell application "Messages" to send "${args.join(" ")}" to buddy "unknown"'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("imessage", e, "macOS required, or use Shortcuts integration"); }
      }
      break;
    case "sms":
      if (!args[0]) err("Usage: sms <message> or sms -n <number> <message>");
      else {
        const carrier = process.env.SMS_CARRIER || "att";
        const to = process.env.SMS_TO || args[0].startsWith("+") ? args[0] : "+" + args[0];
        try { execSync(`echo "Message: ${args.join(" ")}" | mail -s "SMS" ${to}@${carrier === "att" ? "txt.att.net" : carrier === "verizon" ? "vtext.com" : "tmomail.net"}`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("sms", e); }
      }
      break;

    // ============ GOOGLE ECOSYSTEM ============
    case "gcloud": case "gcp":
      try { execSync(`gcloud ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gcloud", e); }
      break;
    case "vertex": case "vertex-ai":
      const VERTEX_PROJECT = process.env.GCP_PROJECT;
      if (!VERTEX_PROJECT) { err("Set GCP_PROJECT env var"); }
      else if (!args[0]) err("Usage: vertex <prompt>");
      else {
        try { execSync(`curl -s -X POST "https://${process.env.GCP_LOCATION || 'us-central1'}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${process.env.GCP_LOCATION || 'us-central1'}/publishers/google/models/text-bison-001:predict" -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" -d '{"instances":[{"content":"'${args.join(" ")}'"}],"parameters":{"temperature":0.2,"maxOutputTokens":1024,"topP":0.8,"topK":40}}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("vertex", e, "gcloud auth login"); }
      }
      break;
    case "firebase":
      try { execSync(`firebase ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("firebase", e); }
      break;
    case "flutter":
      try { execSync(`flutter ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flutter", e); }
      break;
    case "dart":
      try { execSync(`dart ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dart", e); }
      break;
    case "gemini": case "google-ai":
      const GEMINI_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_KEY) { err("Set GEMINI_API_KEY env var"); }
      else if (!args[0]) err("Usage: gemini <prompt>");
      else {
        try { execSync(`curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}" -H "Content-Type: application/json" -X POST -d '{"contents":[{"parts":[{"text":"'${args.join(" ")}'"}]}]}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("gemini", e); }
      }
      break;
    case "google-auth": case "gauth":
      try { execSync("gcloud auth login", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gcloud auth", e); }
      break;
    case "gsutil":
      try { execSync(`gsutil ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gsutil", e); }
      break;
    case "google-play": case "gplay":
      try { execSync(`google-play-cli ${args.join(" ")} 2>/dev/null || echo "npm i -g @aspect-build/google-play-cli"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("google-play", e); }
      break;
    case "google-apps-script": case "gas":
      try { execSync(`clasp ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gas", e, "npm i -g @google/clasp"); }
      break;

    // ============ AI/ML PLATFORMS ============
    case "openai": case "chatgpt":
      const OPENAI_KEY = process.env.OPENAI_API_KEY;
      if (!OPENAI_KEY) { err("Set OPENAI_API_KEY env var"); }
      else if (!args[0]) err("Usage: openai <prompt>");
      else {
        try { execSync(`curl -s "https://api.openai.com/v1/chat/completions" -H "Authorization: Bearer ${OPENAI_KEY}" -H "Content-Type: application/json" -d '{"model":"gpt-4","messages":[{"role":"user","content":"'${args.join(" ")}'"}],"max_tokens":2048}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("openai", e); }
      }
      break;
    case "claude": case "anthropic":
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) { err("Set ANTHROPIC_API_KEY env var"); }
      else if (!args[0]) err("Usage: claude <prompt>");
      else {
        try { execSync(`curl -s "https://api.anthropic.com/v1/messages" -H "x-api-key: ${ANTHROPIC_KEY}" -H "anthropic-version: 2023-06-01" -H "Content-Type: application/json" -d '{"model":"claude-3-opus-20240229","max_tokens":2048,"messages":[{"role":"user","content":"'${args.join(" ")}'"}]}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("claude", e); }
      }
      break;
    case "anthropic-api":
      try { execSync(`curl -s "https://api.anthropic.com/v1/messages" -H "x-api-key: ${process.env.ANTHROPIC_API_KEY}" -H "anthropic-version: 2023-06-01" -H "Content-Type: application/json" -d '${JSON.stringify({ model: "claude-3-sonnet-20240229", max_tokens: 1024, messages: [{ role: "user", content: args.join(" ") }] })}'`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("anthropic", e); }
      break;
    case "huggingface": case "hf":
      const HF_TOKEN = process.env.HF_TOKEN;
      if (!args[0]) err("Usage: huggingface <model> or hf inference <prompt>");
      else if (args[0] === "inference" || args[0] === "infer") {
        if (!args[1]) err("Usage: huggingface inference <prompt>");
        else {
          try { execSync(`curl -s "https://api-inference.huggingface.co/models/${args[1]}" -H "Authorization: Bearer ${HF_TOKEN}" -X POST -d '{"inputs":"'${args.slice(2).join(" ")}'"}'`, { encoding: "utf-8", stdio: "inherit" }); }
          catch (e: any) { handleError("huggingface", e); }
        }
      } else {
        try { execSync(`huggingface-cli download ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("huggingface", e, "pip install huggingface_hub"); }
      }
      break;
    case "hf-inference":
      const HF_INFERENCE_KEY = process.env.HF_INFERENCE_TOKEN;
      if (!HF_INFERENCE_KEY) { err("Set HF_INFERENCE_TOKEN env var"); }
      else if (!args[0]) err("Usage: hf-inference <model> <prompt>");
      else {
        try { execSync(`curl -s "https://api-inference.huggingface.co/models/${args[0]}" -H "Authorization: Bearer ${HF_INFERENCE_KEY}" -X POST -d '{"inputs":"'${args.slice(1).join(" ")}'"}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("hf-inference", e); }
      }
      break;
    case "cohere":
      const COHERE_KEY = process.env.COHERE_API_KEY;
      if (!COHERE_KEY) { err("Set COHERE_API_KEY env var"); }
      else if (!args[0]) err("Usage: cohere <prompt>");
      else {
        try { execSync(`curl -s "https://api.cohere.ai/v1/generate" -H "Authorization: Bearer ${COHERE_KEY}" -H "Content-Type: application/json" -d '{"model":"command-nightly","prompt":"'${args.join(" ")}'","max_tokens":512}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("cohere", e); }
      }
      break;
    case "openrouter":
      const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
      if (!OPENROUTER_KEY) { err("Set OPENROUTER_API_KEY env var"); }
      else if (!args[0]) err("Usage: openrouter <prompt>");
      else {
        try { execSync(`curl -s "https://openrouter.ai/api/v1/chat/completions" -H "Authorization: Bearer ${OPENROUTER_KEY}" -H "Content-Type: application/json" -d '{"model":"openai/gpt-3.5-turbo","messages":[{"role":"user","content":"'${args.join(" ")}'"}]}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("openrouter", e); }
      }
      break;
    case "replicate":
      const REPLICATE_KEY = process.env.REPLICATE_API_TOKEN;
      if (!REPLICATE_KEY) { err("Set REPLICATE_API_TOKEN env var"); }
      else if (!args[0]) err("Usage: replicate <model:version> <prompt>");
      else {
        try { execSync(`curl -s "https://api.replicate.com/v1/predictions" -H "Authorization: Token ${REPLICATE_KEY}" -H "Content-Type: application/json" -d '{"version":"'${args[0]}','input":{"prompt":"'${args.slice(1).join(" ")}'"}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("replicate", e); }
      }
      break;
    case "langchain": case "lc":
      try { execSync(`langchain ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("langchain", e); }
      break;
    case "flowise":
      const FLOWISE_URL = process.env.FLOWISE_URL || "http://localhost:3000";
      if (!args[0]) err("Usage: flowise <chatflow-id> <message>");
      else if (!args[1]) err("Usage: flowise <chatflow-id> <message>");
      else {
        try { execSync(`curl -s -X POST "${FLOWISE_URL}/api/v1/prediction/${args[0]}" -H "Content-Type: application/json" -d '{"question":"'${args.slice(1).join(" ")}'"}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("flowise", e); }
      }
      break;
    case "botpress":
      const BPRESS_URL = process.env.BOTPRESS_URL;
      const BPRESS_TOKEN = process.env.BOTPRESS_TOKEN;
      if (!BPRESS_URL || !BPRESS_TOKEN) { err("Set BOTPRESS_URL and BOTPRESS_TOKEN"); }
      else if (!args[0]) err("Usage: botpress <conversation_id> <message>");
      else if (!args[1]) err("Usage: botpress <conversation_id> <message>");
      else {
        try { execSync(`curl -s -X POST "${BPRESS_URL}/api/v1/bots/talk" -H "Authorization: Bearer ${BPRESS_TOKEN}" -H "Content-Type: application/json" -d '{"conversationId":"'${args[0]}','text":"'${args.slice(1).join(" ")}'"}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("botpress", e); }
      }
      break;
    case "datarobot":
      const DR_KEY = process.env.DATAROBOT_KEY;
      const DR_URL = process.env.DATAROBOT_URL || "https://app.datarobot.com";
      if (!DR_KEY) { err("Set DATAROBOT_KEY env var"); }
      else {
        try { execSync(`curl -s "${DR_URL}/api/v2/" -H "Authorization: Bearer ${DR_KEY}"`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("datarobot", e); }
      }
      break;
    case "kimi":
      const KIMI_KEY = process.env.KIMI_API_KEY;
      if (!KIMI_KEY) { err("Set KIMI_API_KEY env var (Moonshot AI)"); }
      else if (!args[0]) err("Usage: kimi <prompt>");
      else {
        try { execSync(`curl -s "https://api.moonshot.cn/v1/chat/completions" -H "Authorization: Bearer ${KIMI_KEY}" -H "Content-Type: application/json" -d '{"model":"kimi-chat","messages":[{"role":"user","content":"'${args.join(" ")}'"}]}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("kimi", e); }
      }
      break;
    case "jules": case "google-jules":
      const JULES_KEY = process.env.JULES_API_KEY;
      if (!JULES_KEY) { err("Set JULES_API_KEY env var"); }
      else if (!args[0]) err("Usage: jules <prompt>");
      else {
        try { execSync(`curl -s "https://jules.googleapis.com/v1/models/jules-001:generateContent" -H "Authorization: Bearer ${JULES_KEY}" -H "Content-Type: application/json" -d '{"contents":[{"parts":[{"text":"'${args.join(" ")}'"}]}]}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("jules", e); }
      }
      break;
    case "bedrock":
      if (!args[0]) err("Usage: bedrock <prompt>");
      else {
        const AWS_REGION = process.env.AWS_REGION || "us-east-1";
        try { execSync(`aws bedrock-runtime invoke-model --model-id anthropic.claude-3-sonnet-20240229-v1:0 --region ${AWS_REGION} --body '{"messages":[{"role":"user","content":[{"text":"'${args.join(" ")}'"}]}],"max_tokens":2048}' --cli-binary-format raw-in-base64-out`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("bedrock", e, "AWS credentials required"); }
      }
      break;
    case "together":
      const TOGETHER_KEY = process.env.TOGETHER_API_KEY;
      if (!TOGETHER_KEY) { err("Set TOGETHER_API_KEY env var"); }
      else if (!args[0]) err("Usage: together <prompt>");
      else {
        try { execSync(`curl -s "https://api.together.xyz/v1/chat/completions" -H "Authorization: Bearer ${TOGETHER_KEY}" -H "Content-Type: application/json" -d '{"model":"mistralai/Mixtral-8x7B-Instruct-v0.1","messages":[{"role":"user","content":"'${args.join(" ")}'"}]}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("together", e); }
      }
      break;
    case "perplexity":
      const PERPLEXITY_KEY = process.env.PERPLEXITY_KEY;
      if (!PERPLEXITY_KEY) { err("Set PERPLEXITY_KEY env var"); }
      else if (!args[0]) err("Usage: perplexity <query>");
      else {
        try { execSync(`curl -s "https://api.perplexity.ai/chat/completions" -H "Authorization: Bearer ${PERPLEXITY_KEY}" -H "Content-Type: application/json" -d '{"model":"llama-3-sonar-small-32k-online","messages":[{"role":"user","content":"'${args.join(" ")}'"}]}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("perplexity", e); }
      }
      break;

    // ============ GITHUB INTEGRATION ============
    case "gh":
      try { execSync(`gh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh", e, "gh auth login"); }
      break;
    case "gh-run": case "gh-actions":
      if (!args[0]) err("Usage: gh-run <workflow> or gh-run list");
      else try { execSync(`gh run ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh run", e); }
      break;
    case "gh-workflow": case "gh-workflows":
      try { execSync(`gh workflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh workflow", e); }
      break;
    case "gh-repo":
      try { execSync(`gh repo ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh repo", e); }
      break;
    case "gh-pr":
      try { execSync(`gh pr ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh pr", e); }
      break;
    case "gh-issue":
      try { execSync(`gh issue ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh issue", e); }
      break;
    case "gh-release":
      try { execSync(`gh release ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh release", e); }
      break;
    case "gh-hook":
      const GH_HOOK_EVENT = args[0] || "push";
      try { execSync(`gh api hooks -X POST -f event=${GH_HOOK_EVENT} -f config='{"url":"'${process.env.GH_WEBHOOK_URL || 'http://localhost'}'","content_type":"json"}'`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh hook", e); }
      break;
    case "gh-secret":
      try { execSync(`gh secret ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh secret", e); }
      break;
    case "gh-deploy-key":
      try { execSync(`gh api repos/{owner}/{repo}/keys -X POST -f title="devmate" -f key="$(cat ~/.ssh/id_rsa.pub)"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh deploy-key", e); }
      break;
    case "gh-pages":
      try { execSync(`gh api repos/{owner}/{repo}/pages -X POST -d '{"source":{"branch":"main","path":"/"}}'`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh pages", e); }
      break;
    case "gh-codespace":
      try { execSync(`gh codespace ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh codespace", e); }
      break;
    case "gh-gist":
      try { execSync(`gh gist ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gh gist", e); }
      break;
    case "github-actions": case "gha":
      try { execSync(`gh run list ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("github-actions", e); }
      break;

    // ============ CLOUD STORAGE ============
    case "dropbox":
      try { execSync(`dropbox ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dropbox", e); }
      break;
    case "onedrive":
      try { execSync(`onedrive ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("onedrive", e); }
      break;
    case "gdrive": case "google-drive":
      try { execSync(`drive ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gdrive", e); }
      break;
    case "box":
      try { execSync(`box ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("box", e); }
      break;
    case "s3":
      try { execSync(`aws s3 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("s3", e); }
      break;
    case "s3cp":
      if (args.length < 2) err("Usage: s3cp <src> <dst>");
      else try { execSync(`aws s3 cp ${args[0]} ${args[1]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("s3cp", e); }
      break;
    case "s3ls":
      try { execSync(`aws s3 ls ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("s3ls", e); }
      break;
    case "s3sync":
      if (args.length < 2) err("Usage: s3sync <src> <dst>");
      else try { execSync(`aws s3 sync ${args[0]} ${args[1]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("s3sync", e); }
      break;

    // ============ PRODUCTIVITY & NOTES ============
    case "notion":
      const NOTION_KEY = process.env.NOTION_KEY;
      if (!NOTION_KEY) { err("Set NOTION_KEY env var"); }
      else if (!args[0]) err("Usage: notion <page-id> or notion db <query>");
      else {
        try { execSync(`curl -s "https://api.notion.com/v1/${args[0]}" -H "Authorization: Bearer ${NOTION_KEY}" -H "Notion-Version: 2022-06-28"`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("notion", e); }
      }
      break;
    case "notion-db":
      const NOTION_DB_KEY = process.env.NOTION_KEY;
      if (!NOTION_DB_KEY) { err("Set NOTION_KEY env var"); }
      else if (!args[0]) err("Usage: notion-db <database_id>");
      else {
        try { execSync(`curl -s "https://api.notion.com/v1/databases/${args[0]}/query" -H "Authorization: Bearer ${NOTION_DB_KEY}" -H "Notion-Version: 2022-06-28" -X POST -d '{}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("notion-db", e); }
      }
      break;
    case "notion-page":
      const NOTION_PAGE_KEY = process.env.NOTION_KEY;
      if (!NOTION_PAGE_KEY) { err("Set NOTION_KEY env var"); }
      else if (!args[0]) err("Usage: notion-page <page_id>");
      else {
        try { execSync(`curl -s "https://api.notion.com/v1/pages/${args[0]}" -H "Authorization: Bearer ${NOTION_PAGE_KEY}" -H "Notion-Version: 2022-06-28"`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("notion-page", e); }
      }
      break;
    case "obsidian":
      const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT;
      if (!OBSIDIAN_VAULT) { err("Set OBSIDIAN_VAULT path env var"); }
      else if (!args[0]) err("Usage: obsidian <note>");
      else try { execSync(`cat "${OBSIDIAN_VAULT}/${args[0]}.md"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("obsidian", e); }
      break;
    case "evernote":
      try { execSync(`evernote ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("evernote", e); }
      break;
    case "readwise":
      const READWISE_KEY = process.env.READWISE_KEY;
      if (!READWISE_KEY) { err("Set READWISE_KEY env var"); }
      else try { execSync(`curl -s "https://readwise.io/api/v2/highlights/" -H "Authorization: Token ${READWISE_KEY}"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("readwise", e); }
      break;
    case "logseq":
      try { execSync(`logseq ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("logseq", e); }
      break;

    // ============ APPLE ECOSYSTEM ============
    case "shortcuts":
      if (!args[0]) err("Usage: shortcuts <name>");
      else try { execSync(`shortcuts run "${args.join(" ")}"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("shortcuts", e); }
      break;
    case "apple-script": case "osascript":
      if (!args[0]) err("Usage: apple-script <script>");
      else try { execSync(`osascript -e '${args.join(" ")}'`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("apple-script", e); }
      break;
    case "automator":
      try { execSync(`automator ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("automator", e); }
      break;
    case "xcodebuild":
      try { execSync(`xcodebuild ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("xcodebuild", e); }
      break;
    case "metal":
      try { execSync(`metal ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("metal", e); }
      break;
    case "swift":
      try { execSync(`swift ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("swift", e); }
      break;
    case "swiftui":
      try { execSync(`swiftui ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("swiftui", e); }
      break;
    case "spotlight":
      try { execSync(`mdfind "kMDItemDisplayName == '${args.join(" ")}'"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("spotlight", e); }
      break;

    // ============ IDE & EDITORS ============
    case "cursor":
      try { execSync("cursor .", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cursor", e); }
      break;
    case "cursor-open": case "cursor-open-file":
      if (!args[0]) err("Usage: cursor-open <file>");
      else try { execSync(`cursor "${args[0]}"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cursor", e); }
      break;
    case "code": case "vscode":
      try { execSync(`code ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vscode", e); }
      break;
    case "vscodium":
      try { execSync(`vscodium ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vscodium", e); }
      break;
    case "sublime":
      try { execSync(`subl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sublime", e); }
      break;
    case "jetbrains":
      if (!args[0]) err("Usage: jetbrains <idea|pycharm|webstorm|goland|phpstorm|rubymine|clion>");
      else try { execSync(`${args[0]} ${args.slice(1).join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jetbrains", e); }
      break;
    case "emacs":
      try { execSync(`emacs ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("emacs", e); }
      break;
    case "helix":
      try { execSync(`hx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("helix", e); }
      break;
    case "lapce":
      try { execSync(`lapce ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lapce", e); }
      break;
    case "zed":
      try { execSync(`zed ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zed", e); }
      break;
    case "windsurf":
      try { execSync(`windsurf ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("windsurf", e); }
      break;

    // ============ WEB PLATFORMS ============
    case "wordpress": case "wp":
      try { execSync(`wp ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("wp", e); }
      break;
    case "shopify":
      try { execSync(`shopify ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("shopify", e); }
      break;
    case "webflow":
      try { execSync(`webflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("webflow", e); }
      break;
    case "framer":
      try { execSync(`framer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("framer", e); }
      break;
    case "webhooks":
      if (!args[0]) err("Usage: webhooks <listen|send>");
      else if (args[0] === "listen") try { execSync(`webhook-listener ${args.slice(1).join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("webhooks", e, "npm i -g webhook-listener"); }
      else if (args[0] === "send") {
        if (args.length < 3) err("Usage: webhooks send <url> <payload>");
        else try { execSync(`curl -s -X POST -H "Content-Type: application/json" -d '${args.slice(2).join(" ")}' "${args[1]}"`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("webhooks", e); }
      }
      break;
    case "ngrok":
      if (!args[0]) err("Usage: ngrok <port>");
      else try { execSync(`ngrok http ${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ngrok", e); }
      break;
    case "cloudflared": case "cloudflare-tunnel":
      if (!args[0]) err("Usage: cloudflared <port>");
      else try { execSync(`cloudflared tunnel --url http://localhost:${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cloudflared", e); }
      break;
    case "tunnel":
      if (!args[0]) err("Usage: tunnel <port>");
      else {
        const tunnelSvc = process.env.TUNNEL_SERVICE || "ngrok";
        try { execSync(`${tunnelSvc} http ${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("tunnel", e); }
      }
      break;
    case "localhost": case "expose":
      if (!args[0]) err("Usage: localhost <port>");
      else try { execSync(`npx localtunnel --port ${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("localhost", e); }
      break;

    // ============ REMOTE DEV & CLOUD IDE ============
    case "replit":
      try { execSync(`replit ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("replit", e); }
      break;
    case "replit-cli": case "repl":
      try { execSync(`repl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("replit-cli", e); }
      break;
    case "anydev": case "any.dev":
      try { execSync(`anydev ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("anydev", e); }
      break;
    case "codespaces":
      try { execSync(`gh codespace ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("codespaces", e); }
      break;
    case "gitpod":
      try { execSync(`gitpod ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gitpod", e); }
      break;
    case "gitlab-workspaces":
      try { execSync(`glab workspace ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gitlab-workspaces", e); }
      break;
    case "glab":
      try { execSync(`glab ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("glab", e); }
      break;
    case "jupyter": case "jupyter-lab":
      try { execSync(`jupyter lab ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jupyter", e); }
      break;
    case "colab": case "google-colab":
      try { execSync("open https://colab.research.google.com/", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("colab", e); }
      break;
    case "kaggle":
      try { execSync(`kaggle ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kaggle", e); }
      break;
    case "binder":
      if (!args[0]) err("Usage: binder <repo>");
      else try { execSync(`open "https://mybinder.org/v2/gh/${args[0]}"`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("binder", e); }
      break;

    // ============ MOBILE & CROSS-PLATFORM ============
    case "expo":
      try { execSync(`expo ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("expo", e); }
      break;
    case "react-native": case "rn":
      try { execSync(`npx react-native ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("react-native", e); }
      break;
    case "cordova":
      try { execSync(`cordova ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cordova", e); }
      break;
    case "ionic":
      try { execSync(`ionic ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ionic", e); }
      break;
    case "capacitor":
      try { execSync(`npx capacitor ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("capacitor", e); }
      break;
    case "flutter-build":
      if (!args[0]) err("Usage: flutter-build <ios|android|web|macos|linux|windows>");
      else try { execSync(`flutter build ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flutter-build", e); }
      break;
    case "xcode-select":
      try { execSync(`xcode-select ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("xcode-select", e); }
      break;
    case "android-sdk": case "adb":
      try { execSync(`adb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("adb", e); }
      break;
    case "fastlane":
      try { execSync(`fastlane ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fastlane", e); }
      break;
    case "appcenter":
      try { execSync(`appcenter ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("appcenter", e); }
      break;

    // ============ K8S & ORCHESTRATION ============
    case "k9s":
      try { execSync("k9s", { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("k9s", e); }
      break;
    case "helm":
      try { execSync(`helm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("helm", e); }
      break;
    case "kustomize":
      try { execSync(`kustomize ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kustomize", e); }
      break;
    case "skaffold":
      try { execSync(`skaffold ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("skaffold", e); }
      break;
    case "istio":
      try { execSync(`istioctl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("istio", e); }
      break;
    case "envoy":
      try { execSync(`envoy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("envoy", e); }
      break;
    case "tekton":
      try { execSync(`tkn ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tekton", e); }
      break;
    case "argocd":
      try { execSync(`argocd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("argocd", e); }
      break;
    case "flux":
      try { execSync(`flux ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flux", e); }
      break;

    // ============ INFRA AS CODE ============
    case "terraform":
      try { execSync(`terraform ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("terraform", e); }
      break;
    case "terraforming":
      try { execSync(`terraforming ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("terraforming", e); }
      break;
    case "pulumi":
      try { execSync(`pulumi ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pulumi", e); }
      break;
    case "chef":
      try { execSync(`chef ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("chef", e); }
      break;
    case "puppet":
      try { execSync(`puppet ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("puppet", e); }
      break;
    case "packer":
      try { execSync(`packer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("packer", e); }
      break;
    case "cdk":
      try { execSync(`cdk ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cdk", e); }
      break;
    case "cdk8s":
      try { execSync(`cdk8s ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cdk8s", e); }
      break;

    // ============ MONITORING & OBSERVABILITY ============
    case "prometheus":
      try { execSync(`prometheus ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("prometheus", e); }
      break;
    case "grafana":
      try { execSync(`grafana-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("grafana", e); }
      break;
    case "datadog":
      try { execSync(`datadog ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("datadog", e); }
      break;
    case "newrelic":
      try { execSync(`newrelic ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("newrelic", e); }
      break;
    case "sentry":
      try { execSync(`sentry-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sentry", e); }
      break;
    case "elastic": case "elasticsearch":
      try { execSync(`elasticsearch ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("elastic", e); }
      break;
    case "kibana":
      try { execSync(`kibana ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kibana", e); }
      break;
    case "loki":
      try { execSync(`loki ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("loki", e); }
      break;
    case "tempo":
      try { execSync(`tempo ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tempo", e); }
      break;
    case "jaeger":
      try { execSync(`jaeger ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jaeger", e); }
      break;
    case "opentelemetry": case "otel":
      try { execSync(`otel ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("opentelemetry", e); }
      break;

    // ============ SECURITY & SECRETS ============
    case "vault":
      try { execSync(`vault ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vault", e); }
      break;
    case "aws-secrets":
      try { execSync(`aws secretsmanager ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aws-secrets", e); }
      break;
    case "gcloud-secrets":
      try { execSync(`gcloud secrets ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gcloud-secrets", e); }
      break;
    case "doppler":
      try { execSync(`doppler ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("doppler", e); }
      break;
    case "bitwarden": case "bw":
      try { execSync(`bw ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bitwarden", e); }
      break;
    case "1password": case "op":
      try { execSync(`op ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("1password", e); }
      break;
    case "age":
      try { execSync(`age ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("age", e); }
      break;
    case "sops":
      try { execSync(`sops ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sops", e); }
      break;
    case "trivy":
      if (!args[0]) err("Usage: trivy <image>");
      else try { execSync(`trivy image ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("trivy", e); }
      break;
    case "snyk":
      try { execSync(`snyk ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("snyk", e); }
      break;
    case "dependabot":
      try { execSync(`dependabot ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dependabot", e); }
      break;

    // ============ EDGE & CLUSTERS ============
    case "k3s":
      try { execSync(`k3s ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("k3s", e); }
      break;
    case "k3d":
      try { execSync(`k3d ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("k3d", e); }
      break;
    case "microk8s":
      try { execSync(`microk8s ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("microk8s", e); }
      break;
    case "minikube":
      try { execSync(`minikube ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("minikube", e); }
      break;
    case "kind":
      try { execSync(`kind ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kind", e); }
      break;
    case "docker-swarm": case "dks":
      try { execSync(`docker swarm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docker-swarm", e); }
      break;
    case "nomad":
      try { execSync(`nomad ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nomad", e); }
      break;
    case "consul":
      try { execSync(`consul ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("consul", e); }
      break;
    case "etcd":
      try { execSync(`etcd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("etcd", e); }
      break;
    case "cilium":
      try { execSync(`cilium ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cilium", e); }
      break;

    // ============ SERVERLESS & FUNCTIONS ============
    case "aws-lambda":
      try { execSync(`aws lambda ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aws-lambda", e); }
      break;
    case "google-functions": case "gcf":
      try { execSync(`gcloud functions ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("google-functions", e); }
      break;
    case "azure-functions": case "azfunc":
      try { execSync(`az func ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("azure-functions", e); }
      break;
    case "vercel":
      try { execSync(`vercel ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vercel", e); }
      break;
    case "netlify":
      try { execSync(`netlify ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("netlify", e); }
      break;
    case "cloudflare-workers": case "cf-workers":
      try { execSync(`wrangler ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cloudflare-workers", e); }
      break;
    case "flyctl": case "fly":
      try { execSync(`flyctl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flyctl", e); }
      break;
    case "railway":
      try { execSync(`railway ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("railway", e); }
      break;
    case "render":
      try { execSync(`render ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("render", e); }
      break;
    case "heroku":
      try { execSync(`heroku ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("heroku", e); }
      break;
    case "supabase":
      try { execSync(`supabase ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("supabase", e); }
      break;
    case "firebase-functions": case "fifn":
      try { execSync(`firebase functions:${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("firebase-functions", e); }
      break;

    // ============ BACKUP & PROTOCOLS ============
    case "restic":
      try { execSync(`restic ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("restic", e); }
      break;
    case "restic-backup":
      const RESTIC_REPO = process.env.RESTIC_REPO || "./backup";
      const RESTIC_PASS = process.env.RESTIC_PASSWORD;
      if (!RESTIC_PASS) { err("Set RESTIC_PASSWORD env var"); }
      else if (!args[0]) err("Usage: restic-backup <path>");
      else try { execSync(`RESTIC_REPO=${RESTIC_REPO} RESTIC_PASSWORD=${RESTIC_PASS} restic backup ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("restic-backup", e); }
      break;
    case "restic-restore":
      const RESTIC_REPO_R = process.env.RESTIC_REPO || "./backup";
      const RESTIC_PASS_R = process.env.RESTIC_PASSWORD;
      if (!RESTIC_PASS_R) { err("Set RESTIC_PASSWORD env var"); }
      else if (!args[0]) err("Usage: restic-restore <snapshot> <path>");
      else try { execSync(`RESTIC_REPO=${RESTIC_REPO_R} RESTIC_PASSWORD=${RESTIC_PASS_R} restic restore ${args[0]} --target ${args[1] || "."}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("restic-restore", e); }
      break;
    case "restic-snapshots":
      const RESTIC_REPO_S = process.env.RESTIC_REPO || "./backup";
      const RESTIC_PASS_S = process.env.RESTIC_PASSWORD;
      if (!RESTIC_PASS_S) { err("Set RESTIC_PASSWORD env var"); }
      else try { execSync(`RESTIC_REPO=${RESTIC_REPO_S} RESTIC_PASSWORD=${RESTIC_PASS_S} restic snapshots`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("restic-snapshots", e); }
      break;
    case "restic-check":
      const RESTIC_REPO_C = process.env.RESTIC_REPO || "./backup";
      const RESTIC_PASS_C = process.env.RESTIC_PASSWORD;
      if (!RESTIC_PASS_C) { err("Set RESTIC_PASSWORD env var"); }
      else try { execSync(`RESTIC_REPO=${RESTIC_REPO_C} RESTIC_PASSWORD=${RESTIC_PASS_C} restic check`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("restic-check", e); }
      break;
    case "borg":
      try { execSync(`borg ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("borg", e); }
      break;
    case "rclone":
      try { execSync(`rclone ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rclone", e); }
      break;
    case "restic-init":
      const RESTIC_REPO_I = process.env.RESTIC_REPO || "./backup";
      const RESTIC_PASS_I = process.env.RESTIC_PASSWORD;
      if (!RESTIC_PASS_I) { err("Set RESTIC_PASSWORD env var"); }
      else try { execSync(`RESTIC_REPO=${RESTIC_REPO_I} RESTIC_PASSWORD=${RESTIC_PASS_I} restic init`, { encoding: "utf-8" }); success("Repository initialized!"); }
      catch (e: any) { handleError("restic-init", e); }
      break;

    // ============ GAMING & STREAMS ============
    case "steam":
      try { execSync(`steam ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("steam", e); }
      break;
    case "epic":
      try { execSync(`epic-games-launcher ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("epic", e); }
      break;
    case "lutris":
      try { execSync(`lutris ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lutris", e); }
      break;
    case "gamemode":
      try { execSync(`gamemoded ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gamemode", e); }
      break;
    case "obs":
      try { execSync(`obs ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("obs", e); }
      break;
    case "streamlabs":
      try { execSync(`streamlabs ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("streamlabs", e); }
      break;
    case "tauri":
      try { execSync(`tauri ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tauri", e); }
      break;

    // ============ PROJECT TRACKING ============
    case "linear":
      try { execSync(`linear ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("linear", e); }
      break;
    case "asana":
      try { execSync(`asana ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("asana", e); }
      break;
    case "trello":
      try { execSync(`trello ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("trello", e); }
      break;
    case "jira":
      try { execSync(`jira ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jira", e); }
      break;
    case "monday":
      try { execSync(`monday ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("monday", e); }
      break;
    case "clickup":
      try { execSync(`clickup ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("clickup", e); }
      break;
    case "todoist":
      try { execSync(`todoist ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("todoist", e); }
      break;

    // ============ AI AGENTS ============
    case "langgraph":
      try { execSync(`langgraph ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("langgraph", e); }
      break;
    case "crewai":
      try { execSync(`crewai ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("crewai", e); }
      break;
    case "autogen":
      try { execSync(`autogen ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("autogen", e); }
      break;
    case "autoagents":
      try { execSync(`autogenstudio ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("autoagents", e); }
      break;
    case "langroid":
      try { execSync(`langroid ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("langroid", e); }
      break;

    // ============ DESIGN & DIAGRAMS ============
    case "figma":
      try { execSync(`figma ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("figma", e); }
      break;
    case "miro":
      try { execSync(`miro ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("miro", e); }
      break;
    case "excalidraw":
      try { execSync(`excalidraw ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("excalidraw", e); }
      break;
    case "lucid":
      try { execSync(`lucid ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lucid", e); }
      break;
    case "drawio":
      try { execSync(`drawio ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("drawio", e); }
      break;
    case "diagrams":
      try { execSync(`diagrams ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("diagrams", e); }
      break;
    case "plantuml":
      try { execSync(`plantuml ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("plantuml", e); }
      break;
    case "mermaid":
      try { execSync(`mmdc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mermaid", e); }
      break;
    case "graphviz":
      try { execSync(`dot ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("graphviz", e); }
      break;

    // ============ CONTENT CREATION ============
    case "midjourney":
      const MJ_API_KEY = process.env.MIDJOURNEY_API_KEY;
      if (!MJ_API_KEY) { err("Set MIDJOURNEY_API_KEY env var"); }
      else if (!args[0]) err("Usage: midjourney <prompt>");
      else {
        try { execSync(`curl -s "https://api.midjourneyapi.com/v1/imagine" -H "Authorization: ${MJ_API_KEY}" -X POST -d '{"prompt":"'${args.join(" ")}'"}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("midjourney", e); }
      }
      break;
    case "dalle": case "dall-e":
      const DALLE_KEY = process.env.OPENAI_API_KEY;
      if (!DALLE_KEY) { err("Set OPENAI_API_KEY env var"); }
      else if (!args[0]) err("Usage: dalle <prompt>");
      else {
        try { execSync(`curl -s "https://api.openai.com/v1/images/generations" -H "Authorization: Bearer ${DALLE_KEY}" -H "Content-Type: application/json" -d '{"model":"dall-e-3","prompt":"'${args.join(" ")}'","size":"1024x1024"}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("dalle", e); }
      }
      break;
    case "stable-diffusion": case "sd":
      const SD_URL = process.env.STABLE_DIFFUSION_URL;
      if (!SD_URL) { err("Set STABLE_DIFFUSION_URL env var"); }
      else if (!args[0]) err("Usage: stable-diffusion <prompt>");
      else {
        try { execSync(`curl -s -X POST "${SD_URL}/sdapi/v1/txt2img" -H "Content-Type: application/json" -d '{"prompt":"'${args.join(" ")}'"}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("stable-diffusion", e); }
      }
      break;
    case "canva":
      try { execSync(`canva ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("canva", e); }
      break;
    case "elevenlabs": case "elevenlabs-tts":
      const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
      if (!ELEVEN_KEY) { err("Set ELEVENLABS_API_KEY env var"); }
      else if (!args[0]) err("Usage: elevenlabs <text>");
      else {
        try { execSync(`curl -s "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM" -H "xi-api-key: ${ELEVEN_KEY}" -H "Content-Type: application/json" -X POST -d '{"text":"'${args.join(" ")}'"}'`, { encoding: "utf-8", stdio: "inherit" }); }
        catch (e: any) { handleError("elevenlabs", e); }
      }
      break;

    // ============ TESTING ============
    case "cypress":
      try { execSync(`cypress ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cypress", e); }
      break;
    case "playwright":
      try { execSync(`playwright ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("playwright", e); }
      break;
    case "puppeteer":
      try { execSync(`puppeteer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("puppeteer", e); }
      break;
    case "selenium":
      try { execSync(`selenium ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("selenium", e); }
      break;
    case "jest":
      try { execSync(`jest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jest", e); }
      break;
    case "vitest":
      try { execSync(`vitest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vitest", e); }
      break;
    case "mocha":
      try { execSync(`mocha ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mocha", e); }
      break;
    case "pytest":
      try { execSync(`pytest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pytest", e); }
      break;
    case "rspec":
      try { execSync(`rspec ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rspec", e); }
      break;

    // ============ DATABASES ============
    case "mysql":
      try { execSync(`mysql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mysql", e); }
      break;
    case "postgresql": case "psql":
      try { execSync(`psql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("postgresql", e); }
      break;
    case "mongosh":
      try { execSync(`mongosh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mongosh", e); }
      break;
    case "redis":
      try { execSync(`redis-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("redis", e); }
      break;
    case "sqlite": case "sqlite3":
      try { execSync(`sqlite3 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sqlite", e); }
      break;
    case "cockroachdb": case "cockroach":
      try { execSync(`cockroach ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cockroachdb", e); }
      break;
    case "dynamodb":
      try { execSync(`aws dynamodb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dynamodb", e); }
      break;
    case "neo4j":
      try { execSync(`cypher-shell ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("neo4j", e); }
      break;
    case "influxdb":
      try { execSync(`influx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("influxdb", e); }
      break;

    // ============ API & PROTOCOLS ============
    case "postman":
      try { execSync(`postman ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("postman", e); }
      break;
    case "insomnia":
      try { execSync(`insomnia ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("insomnia", e); }
      break;
    case "hopscotch":
      try { execSync(`hoppscotch ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hopscotch", e); }
      break;
    case "httpie": case "ht":
      try { execSync(`http ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("httpie", e); }
      break;
    case "wscat":
      try { execSync(`wscat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("wscat", e); }
      break;
    case "grpc":
      try { execSync(`grpc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("grpc", e); }
      break;
    case "grpcurl":
      try { execSync(`grpcurl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("grpcurl", e); }
      break;

    // ============ AUTH & IDENTITY ============
    case "auth0":
      try { execSync(`auth0 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("auth0", e); }
      break;
    case "clerk":
      try { execSync(`clerk ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("clerk", e); }
      break;
    case "keycloak":
      try { execSync(`kc.sh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("keycloak", e); }
      break;
    case "okta":
      try { execSync(`okta ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("okta", e); }
      break;

    // ============ TERMINAL & SHELL ============
    case "tmux":
      try { execSync(`tmux ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tmux", e); }
      break;
    case "zsh":
      try { execSync(`zsh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zsh", e); }
      break;
    case "fish":
      try { execSync(`fish ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fish", e); }
      break;
    case "starship":
      try { execSync(`starship ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("starship", e); }
      break;
    case "fig":
      try { execSync(`fig ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fig", e); }
      break;

    // ============ REAL-TIME ============
    case "pusher":
      try { execSync(`pusher ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pusher", e); }
      break;
    case "ably":
      try { execSync(`ably ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ably", e); }
      break;
    case "pubnub":
      try { execSync(`pubnub ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pubnub", e); }
      break;

    // ============ SYSTEM INFO & MAINTENANCE ============
    case "sysinfo":
      try { execSync(`uname -a && cat /proc/cpuinfo | head -5 && free -h`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sysinfo", e); }
      break;
    case "neofetch":
      try { execSync(`neofetch`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("neofetch", e, "neofetch not installed"); }
      break;
    case "btop":
      try { execSync(`btop`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("btop", e, "btop not installed"); }
      break;
    case "glances":
      try { execSync(`glances`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("glances", e, "pip install glances"); }
      break;
    case "speedtest":
      try { execSync(`speedtest-cli`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("speedtest", e, "pip install speedtest-cli"); }
      break;
    case "whois":
      if (!args[0]) err("Usage: whois <domain>");
      else try { execSync(`whois ${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("whois", e); }
      break;
    case "dns":
      if (!args[0]) err("Usage: dns <domain>");
      else try { execSync(`dig ${args[0]}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dns", e); }
      break;
    case "docker-clean":
      try { execSync(`docker system prune -af`, { encoding: "utf-8", stdio: "inherit" }); success("Docker cleaned!"); }
      catch (e: any) { handleError("docker-clean", e); }
      break;
    case "npm-clean":
      try { execSync(`npm cache clean --force`, { encoding: "utf-8", stdio: "inherit" }); success("npm cache cleaned!"); }
      catch (e: any) { handleError("npm-clean", e); }
      break;
    case "apt-clean":
      try { execSync(`sudo apt clean && sudo apt autoremove -y`, { encoding: "utf-8", stdio: "inherit" }); success("apt cleaned!"); }
      catch (e: any) { handleError("apt-clean", e); }
      break;
    case "ncdu":
      try { execSync(`ncdu`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ncdu", e, "sudo apt install ncdu"); }
      break;

    // ============ BUSINESS ============
    case "zoom":
      try { execSync(`zoom ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zoom", e); }
      break;
    case "teams":
      try { execSync(`teams ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("teams", e); }
      break;
    case "airtable":
      try { execSync(`airtable ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("airtable", e); }
      break;
    case "hubspot":
      try { execSync(`hs ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hubspot", e); }
      break;
    case "salesforce":
      try { execSync(`sf ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("salesforce", e); }
      break;
    case "pipedrive":
      try { execSync(`pipedrive ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pipedrive", e); }
      break;

    // ============ RESEARCH ============
    case "colab":
      try { execSync(`open https://colab.research.google.com/`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("colab", e); }
      break;
    case "kaggle":
      try { execSync(`kaggle ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kaggle", e); }
      break;

    // ============ BLOCKCHAIN & WEB3 ============
    case "solana": case "sol":
      try { execSync(`solana ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("solana", e); }
      break;
    case "ethers": case "eth":
      try { execSync(`ethers ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ethers", e); }
      break;
    case "hardhat":
      try { execSync(`hardhat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hardhat", e); }
      break;
    case "truffle":
      try { execSync(`truffle ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("truffle", e); }
      break;
    case "foundry":
      try { execSync(`foundry ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("foundry", e); }
      break;
    case "web3js":
      try { execSync(`web3 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("web3js", e); }
      break;
    case "ipfs":
      try { execSync(`ipfs ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ipfs", e); }
      break;
    case "ipfs-cluster":
      try { execSync(`ipfs-cluster ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ipfs-cluster", e); }
      break;
    case "filecoin":
      try { execSync(`filecoin ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("filecoin", e); }
      break;
    case "arweave":
      try { execSync(`arweave ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("arweave", e); }
      break;
    case "nftstorage":
      try { execSync(`nftstorage ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nftstorage", e); }
      break;
    case "moralis":
      try { execSync(`moralis ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("moralis", e); }
      break;
    case "alchemy":
      try { execSync(`alchemy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("alchemy", e); }
      break;
    case "infura":
      try { execSync(`infura ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("infura", e); }
      break;

    // ============ DATA ENGINEERING ============
    case "airflow":
      try { execSync(`airflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("airflow", e); }
      break;
    case "dbt":
      try { execSync(`dbt ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dbt", e); }
      break;
    case "dbt-core":
      try { execSync(`dbt-core ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dbt-core", e); }
      break;
    case "spark":
      try { execSync(`spark ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("spark", e); }
      break;
    case "pyspark":
      try { execSync(`pyspark ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pyspark", e); }
      break;
    case "duckdb":
      try { execSync(`duckdb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("duckdb", e); }
      break;
    case "polars":
      try { execSync(`polars ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("polars", e); }
      break;
    case "dask":
      try { execSync(`dask ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dask", e); }
      break;
    case "fink":
      try { execSync(`fink ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fink", e); }
      break;
    case "presto": case "trino":
      try { execSync(`presto ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("presto", e); }
      break;
    case "snowflake":
      try { execSync(`snowsql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("snowflake", e); }
      break;
    case "bigquery":
      try { execSync(`bq ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bigquery", e); }
      break;
    case "redshift":
      try { execSync(`redshift ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("redshift", e); }
      break;
    case "clickhouse":
      try { execSync(`clickhouse ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("clickhouse", e); }
      break;
    case "duckdb-cli":
      try { execSync(`duckdb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("duckdb-cli", e); }
      break;
    case "mlflow":
      try { execSync(`mlflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mlflow", e); }
      break;
    case "weights-biases": case "wandb":
      try { execSync(`wandb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("wandb", e); }
      break;
    case "comet-ml":
      try { execSync(`comet ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("comet-ml", e); }
      break;
    case "tensorboard":
      try { execSync(`tensorboard ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tensorboard", e); }
      break;
    case "aimstack": case "aim":
      try { execSync(`aim ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aim", e); }
      break;
    case "neptune":
      try { execSync(`neptune ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("neptune", e); }
      break;

    // ============ MACHINE LEARNING ============
    case "python": case "py":
      try { execSync(`python3 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("python", e); }
      break;
    case "python2": case "py2":
      try { execSync(`python2 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("python2", e); }
      break;
    case "pytorch": case "torch":
      try { execSync(`torch ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pytorch", e); }
      break;
    case "tensorflow": case "tf":
      try { execSync(`tensorflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tensorflow", e); }
      break;
    case "keras":
      try { execSync(`keras ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("keras", e); }
      break;
    case "scikit-learn": case "sklearn":
      try { execSync(`sklearn ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sklearn", e); }
      break;
    case "jax":
      try { execSync(`jax ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jax", e); }
      break;
    case "mxnet":
      try { execSync(`mxnet ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mxnet", e); }
      break;
    case "onnx":
      try { execSync(`onnx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("onnx", e); }
      break;
    case "torchvision":
      try { execSync(`torchvision ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("torchvision", e); }
      break;
    case "transformers": case "huggingface-transformers":
      try { execSync(`transformers-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("transformers", e); }
      break;
    case "diffusers":
      try { execSync(`diffusers ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("diffusers", e); }
      break;
    case "accelerate":
      try { execSync(`accelerate ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("accelerate", e); }
      break;
    case "peft":
      try { execSync(`peft ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("peft", e); }
      break;
    case "triton":
      try { execSync(`triton ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("triton", e); }
      break;
    case "xgboost":
      try { execSync(`xgboost ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("xgboost", e); }
      break;
    case "lightgbm":
      try { execSync(`lightgbm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lightgbm", e); }
      break;
    case "catboost":
      try { execSync(`catboost ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("catboost", e); }
      break;
    case "fastai":
      try { execSync(`fastai ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fastai", e); }
      break;
    case "ultralytics":
      try { execSync(`ultralytics ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ultralytics", e); }
      break;
    case "detectron2":
      try { execSync(`detectron2 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("detectron2", e); }
      break;
    case "mmdetection":
      try { execSync(`mmdet ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mmdetection", e); }
      break;
    case "timm":
      try { execSync(`timm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("timm", e); }
      break;
    case "albumentations":
      try { execSync(`albumentations ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("albumentations", e); }
      break;
    case "torchmetrics":
      try { execSync(`torchmetrics ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("torchmetrics", e); }
      break;
    case "pytorch-ignite":
      try { execSync(`ignite ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pytorch-ignite", e); }
      break;
    case "pytorch-lightning": case "lightning":
      try { execSync(`lightning ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pytorch-lightning", e); }
      break;

    // ============ CI/CD ============
    case "jenkins":
      try { execSync(`jenkins ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jenkins", e); }
      break;
    case "circleci":
      try { execSync(`circleci ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("circleci", e); }
      break;
    case "travis":
      try { execSync(`travis ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("travis", e); }
      break;
    case "gitlab-ci":
      try { execSync(`gitlab-runner ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gitlab-ci", e); }
      break;
    case "bitbucket-pipes":
      try { execSync(`bitbucket-pipes ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bitbucket-pipes", e); }
      break;
    case "drone":
      try { execSync(`drone ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("drone", e); }
      break;
    case "buildkite":
      try { execSync(`buildkite ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("buildkite", e); }
      break;
    case "azure-pipelines":
      try { execSync(`azure-pipelines ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("azure-pipelines", e); }
      break;
    case "semaphore":
      try { execSync(`semaphore ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("semaphore", e); }
      break;
    case "woodpecker":
      try { execSync(`woodpecker ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("woodpecker", e); }
      break;

    // ============ CONTAINER ORCHESTRATION ============
    case "podman":
      try { execSync(`podman ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("podman", e); }
      break;
    case "containerd":
      try { execSync(`containerd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("containerd", e); }
      break;
    case "crictl":
      try { execSync(`crictl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("crictl", e); }
      break;
    case "nerdctl":
      try { execSync(`nerdctl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nerdctl", e); }
      break;
    case "buildah":
      try { execSync(`buildah ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("buildah", e); }
      break;
    case "skopeo":
      try { execSync(`skopeo ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("skopeo", e); }
      break;
    case "crun":
      try { execSync(`crun ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("crun", e); }
      break;
    case "runc":
      try { execSync(`runc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("runc", e); }
      break;
    case "cni":
      try { execSync(`cni ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cni", e); }
      break;
    case "crictl":
      try { execSync(`crictl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("crictl", e); }
      break;

    // ============ SERVICE MESH ============
    case "linkerd":
      try { execSync(`linkerd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("linkerd", e); }
      break;
    case "consul":
      try { execSync(`consul ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("consul", e); }
      break;
    case "nomad":
      try { execSync(`nomad ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nomad", e); }
      break;
    case "serf":
      try { execSync(`serf ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("serf", e); }
      break;
    case "traefik":
      try { execSync(`traefik ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("traefik", e); }
      break;
    case "envoy-proxy": case "envoy":
      try { execSync(`envoy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("envoy-proxy", e); }
      break;
    case "nginx":
      try { execSync(`nginx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nginx", e); }
      break;
    case "haproxy":
      try { execSync(`haproxy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("haproxy", e); }
      break;
    case "caddy":
      try { execSync(`caddy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("caddy", e); }
      break;
    case "apache":
      try { execSync(`apache2 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("apache", e); }
      break;

    // ============ MESSAGING QUEUES ============
    case "rabbitmq":
      try { execSync(`rabbitmqctl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rabbitmq", e); }
      break;
    case "kafka":
      try { execSync(`kafka ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kafka", e); }
      break;
    case "pulsar":
      try { execSync(`pulsar ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pulsar", e); }
      break;
    case "nats":
      try { execSync(`nats ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nats", e); }
      break;
    case "activemq":
      try { execSync(`activemq ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("activemq", e); }
      break;
    case "zeromq": case "zmq":
      try { execSync(`zmq ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zeromq", e); }
      break;

    // ============ SEARCH ENGINES ============
    case "elasticsearch": case "elastic":
      try { execSync(`elasticsearch ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("elasticsearch", e); }
      break;
    case "meilisearch":
      try { execSync(`meilisearch ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("meilisearch", e); }
      break;
    case "typesense":
      try { execSync(`typesense ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("typesense", e); }
      break;
    case "opensearch":
      try { execSync(`opensearch ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("opensearch", e); }
      break;
    case "solr":
      try { execSync(`solr ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("solr", e); }
      break;
    case "algolia":
      try { execSync(`algolia ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("algolia", e); }
      break;

    // ============ CACHE ============
    case "redis-server":
      try { execSync(`redis-server ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("redis-server", e); }
      break;
    case "memcached":
      try { execSync(`memcached ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("memcached", e); }
      break;
    case "varnish":
      try { execSync(`varnishd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("varnish", e); }
      break;
    case "etcd":
      try { execSync(`etcd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("etcd", e); }
      break;
    case "consul":
      try { execSync(`consul ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("consul", e); }
      break;

    // ============ API GATEWAYS ============
    case "kong":
      try { execSync(`kong ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kong", e); }
      break;
    case "tyk":
      try { execSync(`tyk ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tyk", e); }
      break;
    case "apigee":
      try { execSync(`apigee ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("apigee", e); }
      break;
    case "aws-apigateway":
      try { execSync(`aws apigateway ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aws-apigateway", e); }
      break;
    case "graphql": case "gql":
      try { execSync(`graphql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("graphql", e); }
      break;
    case "apollo":
      try { execSync(`apollo ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("apollo", e); }
      break;
    case "hasura":
      try { execSync(`hasura ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hasura", e); }
      break;
    case "prisma":
      try { execSync(`prisma ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("prisma", e); }
      break;
    case "drizzle":
      try { execSync(`drizzle ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("drizzle", e); }
      break;
    case "knex":
      try { execSync(`knex ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("knex", e); }
      break;
    case "typeorm":
      try { execSync(`typeorm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("typeorm", e); }
      break;
    case "sequelize":
      try { execSync(`sequelize ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sequelize", e); }
      break;
    case "querydsl":
      try { execSync(`querydsl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("querydsl", e); }
      break;

    // ============ MONITORING ============
    case "prometheus":
      try { execSync(`prometheus ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("prometheus", e); }
      break;
    case "alertmanager":
      try { execSync(`alertmanager ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("alertmanager", e); }
      break;
    case "thanos":
      try { execSync(`thanos ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("thanos", e); }
      break;
    case "mimir":
      try { execSync(`mimir ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mimir", e); }
      break;
    case "cortex":
      try { execSync(`cortex ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cortex", e); }
      break;
    case "victoria-metrics":
      try { execSync(`victoria-metrics ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("victoria-metrics", e); }
      break;
    case "loki":
      try { execSync(`loki ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("loki", e); }
      break;
    case "grafana":
      try { execSync(`grafana ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("grafana", e); }
      break;
    case "kibana":
      try { execSync(`kibana ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kibana", e); }
      break;
    case "kafka-ui":
      try { execSync(`kafka-ui ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kafka-ui", e); }
      break;
    case "portainer":
      try { execSync(`portainer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("portainer", e); }
      break;
    case "rancher":
      try { execSync(`rancher ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rancher", e); }
      break;
    case "longhorn":
      try { execSync(`longhorn ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("longhorn", e); }
      break;
    case "rook":
      try { execSync(`rook ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rook", e); }
      break;
    case "cattle":
      try { execSync(`cattle ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cattle", e); }
      break;

    // ============ LOGGING ============
    case "fluentd":
      try { execSync(`fluentd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fluentd", e); }
      break;
    case "fluent-bit": case "fluentbit":
      try { execSync(`fluent-bit ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fluent-bit", e); }
      break;
    case "logstash":
      try { execSync(`logstash ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("logstash", e); }
      break;
    case "filebeat":
      try { execSync(`filebeat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("filebeat", e); }
      break;
    case "metricbeat":
      try { execSync(`metricbeat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("metricbeat", e); }
      break;
    case "packetbeat":
      try { execSync(`packetbeat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("packetbeat", e); }
      break;
    case "journalbeat":
      try { execSync(`journalbeat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("journalbeat", e); }
      break;
    case "syslog":
      try { execSync(`syslog ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("syslog", e); }
      break;
    case "rsyslog":
      try { execSync(`rsyslogd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rsyslog", e); }
      break;

    // ============ TRACING ============
    case "jaeger":
      try { execSync(`jaeger ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jaeger", e); }
      break;
    case "zipkin":
      try { execSync(`zipkin ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zipkin", e); }
      break;
    case "tempo":
      try { execSync(`tempo ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tempo", e); }
      break;
    case "signoz":
      try { execSync(`signoz ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("signoz", e); }
      break;
    case "honeycomb":
      try { execSync(`honeycomb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("honeycomb", e); }
      break;
    case "lightstep":
      try { execSync(`lightstep ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lightstep", e); }
      break;

    // ============ SECRET MANAGEMENT ============
    case "hashicorp-vault": case "vault":
      try { execSync(`vault ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vault", e); }
      break;
    case "aws-secrets-manager":
      try { execSync(`aws secretsmanager ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aws-secrets-manager", e); }
      break;
    case "gcp-secret-manager":
      try { execSync(`gcloud secrets ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gcp-secret-manager", e); }
      break;
    case "azure-key-vault":
      try { execSync(`az keyvault ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("azure-key-vault", e); }
      break;
    case "cyberark":
      try { execSync(`cyberark ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cyberark", e); }
      break;
    case "thycotic":
      try { execSync(`thycotic ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("thycotic", e); }
      break;
    case "bitwarden": case "bw":
      try { execSync(`bw ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bitwarden", e); }
      break;
    case "1password": case "op":
      try { execSync(`op ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("1password", e); }
      break;
    case "lastpass":
      try { execSync(`lpass ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lastpass", e); }
      break;
    case "keepass":
      try { execSync(`keepass ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("keepass", e); }
      break;
    case "doppler":
      try { execSync(`doppler ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("doppler", e); }
      break;
    case "infisical":
      try { execSync(`infisical ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("infisical", e); }
      break;
    case "sops":
      try { execSync(`sops ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sops", e); }
      break;
    case "age":
      try { execSync(`age ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("age", e); }
      break;

    // ============ IDENTITY PROVIDERS ============
    case "keycloak":
      try { execSync(`keycloak ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("keycloak", e); }
      break;
    case "okta":
      try { execSync(`okta ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("okta", e); }
      break;
    case "auth0":
      try { execSync(`auth0 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("auth0", e); }
      break;
    case "clerk":
      try { execSync(`clerk ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("clerk", e); }
      break;
    case "supabase-auth":
      try { execSync(`supabase auth ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("supabase-auth", e); }
      break;
    case "firebase-auth":
      try { execSync(`firebase auth ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("firebase-auth", e); }
      break;
    case "cognito":
      try { execSync(`aws cognito-idp ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cognito", e); }
      break;
    case "pingidentity": case "ping":
      try { execSync(`pingfederate ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pingidentity", e); }
      break;
    case "fusionauth":
      try { execSync(`fusionauth ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fusionauth", e); }
      break;
    case "casdoor":
      try { execSync(`casdoor ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("casdoor", e); }
      break;

    // ============ CDN & EDGE ============
    case "cloudflare": case "cf":
      try { execSync(`cloudflare ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cloudflare", e); }
      break;
    case "fastly":
      try { execSync(`fastly ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fastly", e); }
      break;
    case "akamai":
      try { execSync(`akamai ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("akamai", e); }
      break;
    case "cloudfront":
      try { execSync(`aws cloudfront ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cloudfront", e); }
      break;
    case "bunny":
      try { execSync(`bunny ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bunny", e); }
      break;
    case "implex": case "imp":
      try { execSync(`imperva ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("implex", e); }
      break;

    // ============ DNS ============
    case "route53": case "r53":
      try { execSync(`aws route53 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("route53", e); }
      break;
    case "dnsmasq":
      try { execSync(`dnsmasq ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dnsmasq", e); }
      break;
    case "corefile": case "coredns":
      try { execSync(`coredns ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("corefile", e); }
      break;
    case "bind": case "named":
      try { execSync(`named ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bind", e); }
      break;
    case "powerdns": case "pdns":
      try { execSync(`pdns ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("powerdns", e); }
      break;

    // ============ LOAD BALANCING ============
    case "haproxy":
      try { execSync(`haproxy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("haproxy", e); }
      break;
    case "traefik":
      try { execSync(`traefik ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("traefik", e); }
      break;
    case "envoy-proxy":
      try { execSync(`envoy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("envoy-proxy", e); }
      break;
    case "nginx":
      try { execSync(`nginx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nginx", e); }
      break;
    case "caddy":
      try { execSync(`caddy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("caddy", e); }
      break;
    case "aws-elb":
      try { execSync(`aws elb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aws-elb", e); }
      break;
    case "aws-alb":
      try { execSync(`aws alb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aws-alb", e); }
      break;
    case "aws-nlb":
      try { execSync(`aws nlb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aws-nlb", e); }
      break;

    // ============ VIRTUALIZATION ============
    case "vagrant":
      try { execSync(`vagrant ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vagrant", e); }
      break;
    case "virtualbox": case "vbox":
      try { execSync(`vboxmanage ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("virtualbox", e); }
      break;
    case "vmware":
      try { execSync(`vmware ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vmware", e); }
      break;
    case "qemu":
      try { execSync(`qemu ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("qemu", e); }
      break;
    case "libvirt":
      try { execSync(`virsh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("libvirt", e); }
      break;
    case "proxmox":
      try { execSync(`pvesh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("proxmox", e); }
      break;
    case "xen":
      try { execSync(`xl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("xen", e); }
      break;

    // ============ CODE ANALYSIS ============
    case "sonarqube": case "sonar":
      try { execSync(`sonar-scanner ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sonarqube", e); }
      break;
    case "sonarlint":
      try { execSync(`sonarlint ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sonarlint", e); }
      break;
    case "codacy":
      try { execSync(`codacy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("codacy", e); }
      break;
    case "codeclimate":
      try { execSync(`codeclimate ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("codeclimate", e); }
      break;
    case "snyk":
      try { execSync(`snyk ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("snyk", e); }
      break;
    case "dependabot":
      try { execSync(`dependabot ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dependabot", e); }
      break;
    case "renovate":
      try { execSync(`renovate ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("renovate", e); }
      break;
    case "white-source": case "whitesource":
      try { execSync(`whitesource ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("white-source", e); }
      break;
    case "sca":
      try { execSync(`sca ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sca", e); }
      break;

    // ============ BUILD TOOLS ============
    case "make":
      try { execSync(`make ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("make", e); }
      break;
    case "cmake":
      try { execSync(`cmake ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cmake", e); }
      break;
    case "meson":
      try { execSync(`meson ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("meson", e); }
      break;
    case "ninja":
      try { execSync(`ninja ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ninja", e); }
      break;
    case "gradle":
      try { execSync(`gradle ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gradle", e); }
      break;
    case "maven": case "mvn":
      try { execSync(`mvn ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("maven", e); }
      break;
    case "ant":
      try { execSync(`ant ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ant", e); }
      break;
    case "sbt":
      try { execSync(`sbt ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sbt", e); }
      break;
    case "bazel":
      try { execSync(`bazel ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bazel", e); }
      break;
    case "buck":
      try { execSync(`buck ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("buck", e); }
      break;
    case "pants":
      try { execSync(`pants ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pants", e); }
      break;
    case "please":
      try { execSync(`please ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("please", e); }
      break;
    case "task": case "taskfile":
      try { execSync(`task ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("task", e); }
      break;
    case "just":
      try { execSync(`just ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("just", e); }
      break;
    case "Invoke-Module": case "invoke":
      try { execSync(`invoke ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("invoke", e); }
      break;
    case "fabric":
      try { execSync(`fab ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fabric", e); }
      break;

    // ============ RUNTIME ENVIRONMENTS ============
    case "node": case "nodejs":
      try { execSync(`node ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("node", e); }
      break;
    case "deno":
      try { execSync(`deno ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("deno", e); }
      break;
    case "bun-runtime":
      try { execSync(`bun ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bun-runtime", e); }
      break;
    case "bun":
      try { execSync(`bun ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bun", e); }
      break;
    case "go-runtime":
      try { execSync(`go run ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("go-runtime", e); }
      break;
    case "java":
      try { execSync(`java ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("java", e); }
      break;
    case "javac":
      try { execSync(`javac ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("javac", e); }
      break;
    case "kotlin":
      try { execSync(`kotlin ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kotlin", e); }
      break;
    case "kotlinc":
      try { execSync(`kotlinc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kotlinc", e); }
      break;
    case "scala":
      try { execSync(`scala ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("scala", e); }
      break;
    case "scalac":
      try { execSync(`scalac ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("scalac", e); }
      break;
    case "groovy":
      try { execSync(`groovy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("groovy", e); }
      break;
    case "clojure":
      try { execSync(`clojure ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("clojure", e); }
      break;
    case "erlang":
      try { execSync(`erl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("erlang", e); }
      break;
    case "elixir":
      try { execSync(`elixir ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("elixir", e); }
      break;
    case "php-runtime":
      try { execSync(`php ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("php-runtime", e); }
      break;
    case "ruby-runtime":
      try { execSync(`ruby ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ruby-runtime", e); }
      break;
    case "perl-runtime":
      try { execSync(`perl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("perl-runtime", e); }
      break;
    case "lua":
      try { execSync(`lua ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lua", e); }
      break;
    case "rust-runtime":
      try { execSync(`rustc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rust-runtime", e); }
      break;
    case "zig":
      try { execSync(`zig ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zig", e); }
      break;
    case "nim":
      try { execSync(`nim ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nim", e); }
      break;
    case "crystal":
      try { execSync(`crystal ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("crystal", e); }
      break;
    case "haskell": case "ghc":
      try { execSync(`ghc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("haskell", e); }
      break;
    case "ocaml":
      try { execSync(`ocaml ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ocaml", e); }
      break;
    case "fsharp": case "fs":
      try { execSync(`fsi ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fsharp", e); }
      break;
    case "julia":
      try { execSync(`julia ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("julia", e); }
      break;
    case "r-language": case "r":
      try { execSync(`R ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("r-language", e); }
      break;

    // ============ MORE AI & AUTOMATION ============
    case "langsmith":
      try { execSync(`langsmith ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("langsmith", e); }
      break;
    case "llamaindex": case "llama-index":
      try { execSync(`llamaindex ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("llamaindex", e); }
      break;
    case "guidance":
      try { execSync(`guidance ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("guidance", e); }
      break;
    case "instructor":
      try { execSync(`instructor ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("instructor", e); }
      break;
    case "litellm":
      try { execSync(`litellm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("litellm", e); }
      break;
    case "txtai":
      try { execSync(`txtai ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("txtai", e); }
      break;
    case "llm":
      try { execSync(`llm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("llm", e); }
      break;
    case "ollama":
      try { execSync(`ollama ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ollama", e); }
      break;
    case "localai": case "local-ai":
      try { execSync(`localai ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("localai", e); }
      break;
    case "lm-studio": case "lmstudio":
      try { execSync(`lm-studio ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lm-studio", e); }
      break;
    case "text-generation-webui": case "webui":
      try { execSync(`text-generation-webui ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("text-generation-webui", e); }
      break;
    case "koboldcpp":
      try { execSync(`koboldcpp ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("koboldcpp", e); }
      break;
    case "silicon-diffusion": case "silicon":
      try { execSync(`silicon ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("silicon-diffusion", e); }
      break;
    case "automatic1111": case "sd-webui":
      try { execSync(`automatic1111 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("automatic1111", e); }
      break;
    case "comfyui":
      try { execSync(`comfy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("comfyui", e); }
      break;
    case "invokeai":
      try { execSync(`invokeai ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("invokeai", e); }
      break;
    case "a1111-sd-webui": case "stable-diffusion-webui":
      try { execSync(`sd-webui ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("stable-diffusion-webui", e); }
      break;

    // ============ NO-CODE & LOW-CODE ============
    case "n8n":
      try { execSync(`n8n ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("n8n", e); }
      break;
    case "make-com": case "make":
      try { execSync(`make ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("make-com", e); }
      break;
    case "zapier":
      try { execSync(`zapier ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zapier", e); }
      break;
    case "pipedream":
      try { execSync(`pipedream ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pipedream", e); }
      break;
    case "integromat": case "make":
      try { execSync(`make ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("integromat", e); }
      break;
    case "power-automate": case "ms-flow":
      try { execSync(`flow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("power-automate", e); }
      break;
    case "appsheet":
      try { execSync(`appsheet ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("appsheet", e); }
      break;
    case "bubble":
      try { execSync(`bubble ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bubble", e); }
      break;
    case "glide":
      try { execSync(`glide ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("glide", e); }
      break;
    case "softr":
      try { execSync(`softr ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("softr", e); }
      break;
    case "stack":
      try { execSync(`stack ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("stack", e); }
      break;

    // ============ RASPBERRY PI & IOT ============
    case "pi-blinka": case "blinka":
      try { execSync(`blinka ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("blinka", e); }
      break;
    case "gpiozero":
      try { execSync(`gpiozero ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gpiozero", e); }
      break;
    case "pigpio":
      try { execSync(`pigpiod ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pigpio", e); }
      break;
    case "wiringpi":
      try { execSync(`gpio ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("wiringpi", e); }
      break;
    case "homeassistant-cli": case "hass-cli":
      try { execSync(`hass-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("homeassistant-cli", e); }
      break;
    case "mosquitto":
      try { execSync(`mosquitto ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mosquitto", e); }
      break;
    case "node-red":
      try { execSync(`node-red ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("node-red", e); }
      break;
    case "openhab":
      try { execSync(`openhab ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("openhab", e); }
      break;

    // ============ GRAPHQL & API TOOLS ============
    case "apollo-server":
      try { execSync(`apollo ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("apollo-server", e); }
      break;
    case "urql":
      try { execSync(`urql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("urql", e); }
      break;
    case "graphql-yoga":
      try { execSync(`graphql-yoga ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("graphql-yoga", e); }
      break;
    case "mercurius":
      try { execSync(`mercurius ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mercurius", e); }
      break;

    // ============ SERVERS & HTTP ============
    case "http-server":
      try { execSync(`http-server ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("http-server", e); }
      break;
    case "serve":
      try { execSync(`serve ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("serve", e); }
      break;
    case "live-server":
      try { execSync(`live-server ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("live-server", e); }
      break;
    case "pm2":
      try { execSync(`pm2 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pm2", e); }
      break;
    case "forever":
      try { execSync(`forever ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("forever", e); }
      break;
    case "nodemon":
      try { execSync(`nodemon ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nodemon", e); }
      break;
    case "httpd": case "apache2":
      try { execSync(`apache2 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("httpd", e); }
      break;
    case "lighttpd":
      try { execSync(`lighttpd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lighttpd", e); }
      break;

    // ============ REMOTE DESKTOP ============
    case "xrdp":
      try { execSync(`xrdp ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("xrdp", e); }
      break;
    case "x11vnc":
      try { execSync(`x11vnc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("x11vnc", e); }
      break;
    case "remmina":
      try { execSync(`remmina ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("remmina", e); }
      break;
    case "vncviewer":
      try { execSync(`vncviewer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vncviewer", e); }
      break;
    case "anydesk":
      try { execSync(`anydesk ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("anydesk", e); }
      break;
    case "teamviewer":
      try { execSync(`teamviewer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("teamviewer", e); }
      break;
    case "parsec":
      try { execSync(`parsec ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("parsec", e); }
      break;

    // ============ NETWORK TOOLS ============
    case "netstat":
      try { execSync(`netstat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("netstat", e); }
      break;
    case "ss":
      try { execSync(`ss ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ss", e); }
      break;
    case "tcpdump":
      try { execSync(`tcpdump ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tcpdump", e); }
      break;
    case "wireshark":
      try { execSync(`wireshark ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("wireshark", e); }
      break;
    case "nmap":
      try { execSync(`nmap ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nmap", e); }
      break;
    case "masscan":
      try { execSync(`masscan ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("masscan", e); }
      break;
    case "nikto":
      try { execSync(`nikto ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nikto", e); }
      break;
    case "dirb":
      try { execSync(`dirb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dirb", e); }
      break;
    case "gobuster":
      try { execSync(`gobuster ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gobuster", e); }
      break;
    case "hydra":
      try { execSync(`hydra ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hydra", e); }
      break;
    case "john":
      try { execSync(`john ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("john", e); }
      break;
    case "hashcat":
      try { execSync(`hashcat ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hashcat", e); }
      break;
    case "aircrack-ng":
      try { execSync(`aircrack-ng ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aircrack-ng", e); }
      break;
    case "ettercap":
      try { execSync(`ettercap ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ettercap", e); }
      break;

    // ============ PENTESTING ============
    case "metasploit": case "msf":
      try { execSync(`msfconsole ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("metasploit", e); }
      break;
    case "burp-suite": case "burp":
      try { execSync(`burp ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("burp-suite", e); }
      break;
    case "owasp-zap": case "zap":
      try { execSync(`zap ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("owasp-zap", e); }
      break;
    case "sqlmap":
      try { execSync(`sqlmap ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sqlmap", e); }
      break;
    case "xsser":
      try { execSync(`xsser ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("xsser", e); }
      break;
    case "beef":
      try { execSync(`beef ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("beef", e); }
      break;

    // ============ STEGANOGRAPHY ============
    case "steghide":
      try { execSync(`steghide ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("steghide", e); }
      break;
    case "zsteg":
      try { execSync(`zsteg ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zsteg", e); }
      break;
    case "binwalk":
      try { execSync(`binwalk ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("binwalk", e); }
      break;
    case "foremost":
      try { execSync(`foremost ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("foremost", e); }
      break;

    // ============ FORENSICS ============
    case "autopsy":
      try { execSync(`autopsy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("autopsy", e); }
      break;
    case "sleuthkit": case "tsk":
      try { execSync(`fls ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sleuthkit", e); }
      break;
    case "volatility":
      try { execSync(`volatility ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("volatility", e); }
      break;

    // ============ REVERSE ENGINEERING ============
    case "ghidra":
      try { execSync(`ghidra ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ghidra", e); }
      break;
    case "ida": case "ida-pro":
      try { execSync(`ida ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ida", e); }
      break;
    case "radare2": case "r2":
      try { execSync(`r2 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("radare2", e); }
      break;
    case "objdump":
      try { execSync(`objdump ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("objdump", e); }
      break;
    case "hexdump": case "xxd":
      try { execSync(`xxd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hexdump", e); }
      break;
    case "strings":
      try { execSync(`strings ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("strings", e); }
      break;

    // ============ BINARY ANALYSIS ============
    case "file":
      try { execSync(`file ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("file", e); }
      break;
    case "readelf":
      try { execSync(`readelf ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("readelf", e); }
      break;
    case "nm":
      try { execSync(`nm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nm", e); }
      break;
    case "ldd":
      try { execSync(`ldd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ldd", e); }
      break;
    case "strace":
      try { execSync(`strace ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("strace", e); }
      break;
    case "ltrace":
      try { execSync(`ltrace ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ltrace", e); }
      break;
    case "gdb":
      try { execSync(`gdb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gdb", e); }
      break;
    case "lldb":
      try { execSync(`lldb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lldb", e); }
      break;
    case "valgrind":
      try { execSync(`valgrind ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("valgrind", e); }
      break;

    // ============ HOMELAB & SELF-HOSTED ============
    case "portainer":
      try { execSync(`portainer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("portainer", e); }
      break;
    case "watchtower":
      try { execSync(`watchtower ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("watchtower", e); }
      break;
    case "duplicati":
      try { execSync(`duplicati ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("duplicati", e); }
      break;
    case "vaultwarden": case "bitwarden-rs":
      try { execSync(`vaultwarden ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vaultwarden", e); }
      break;
    case "adguard":
      try { execSync(`adguard ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("adguard", e); }
      break;
    case "pi-hole":
      try { execSync(`pihole ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pi-hole", e); }
      break;
    case "wireguard":
      try { execSync(`wireguard ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("wireguard", e); }
      break;
    case "openvpn":
      try { execSync(`openvpn ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("openvpn", e); }
      break;
    case "tailscale":
      try { execSync(`tailscale ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tailscale", e); }
      break;
    case "headscale":
      try { execSync(`headscale ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("headscale", e); }
      break;

    // ============ MEDIA TOOLS ============
    case "ffmpeg":
      try { execSync(`ffmpeg ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ffmpeg", e); }
      break;
    case "imagemagick": case "convert":
      try { execSync(`convert ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("imagemagick", e); }
      break;
    case "imagemagick7": case "magick":
      try { execSync(`magick ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("magick", e); }
      break;
    case "sharp":
      try { execSync(`sharp ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sharp", e); }
      break;
    case "squoosh":
      try { execSync(`squoosh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("squoosh", e); }
      break;
    case "pandoc":
      try { execSync(`pandoc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pandoc", e); }
      break;
    case "calibre":
      try { execSync(`calibre ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("calibre", e); }
      break;

    // ============ ACCESSIBILITY ============
    case "a11y": case "axe":
      try { execSync(`axe ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("a11y", e); }
      break;
    case "lighthouse":
      try { execSync(`lighthouse ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lighthouse", e); }
      break;
    case "wave":
      try { execSync(`wave ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("wave", e); }
      break;

    // ======= EXTENSIVE NEW COMMANDS =======
    // Cloud Platforms
    case "digitalocean": case "doctl":
      try { execSync(`doctl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("doctl", e, "Install: brew install doctl"); }
      break;
    case "linode": case "linode-cli":
      try { execSync(`linode-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("linode", e, "Install: pip install linode-cli"); }
      break;
    case "vultr":
      try { execSync(`vultr ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vultr", e); }
      break;
    case "ovhcloud": case "ovh":
      console.log(chalk.cyan("OVHcloud: ") + "ovh.com manager");
      break;
    case "scaleway":
      console.log(chalk.cyan("Scaleway: ") + "console.scaleway.com");
      break;
    case "upcloud":
      console.log(chalk.cyan("UpCloud: ") + "upcloud.com");
      break;
    case "heterodb": case "hetero":
      console.log(chalk.cyan("HeteroDB: ") + "heterodb.com");
      break;

    // More DevOps
    case "terraform-compliance": case "tfc":
      try { execSync(`terraform-compliance ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("terraform-compliance", e, "pip install terraform-compliance"); }
      break;
    case "terragrunt":
      try { execSync(`terragrunt ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("terragrunt", e, "brew install terragrunt"); }
      break;
    case "sentinel": case "terraform-sentinel":
      console.log(chalk.cyan("Terraform Sentinel: ") + "hashicorp.com/docs/sentinel");
      break;
    case "packer":
      try { execSync(`packer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("packer", e, "brew install packer"); }
      break;
    case "vagrant":
      try { execSync(`vagrant ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vagrant", e, "brew install vagrant"); }
      break;
    case "consul":
      try { execSync(`consul ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("consul", e); }
      break;
    case "vault":
      try { execSync(`vault ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vault", e, "brew install vault"); }
      break;
    case "nomad":
      try { execSync(`nomad ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nomad", e); }
      break;
    case "waypoint":
      try { execSync(`waypoint ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("waypoint", e); }
      break;
    case "fabrict": case "fabric":
      try { execSync(`fabric ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fabric", e, "pip install fabric"); }
      break;
    case "capistrano":
      try { execSync(`cap ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("capistrano", e, "gem install capistrano"); }
      break;
    case "mina":
      try { execSync(`mina ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mina", e, "gem install mina"); }
      break;
    case "rocketeer":
      console.log(chalk.cyan("Rocketeer: ") + "rocketeer.ch");
      break;

    // CI/CD More
    case "gitlab-runner":
      try { execSync(`gitlab-runner ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gitlab-runner", e); }
      break;
    case "drone":
      try { execSync(`drone ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("drone", e); }
      break;
    case "concourse":
      try { execSync(`fly ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("concourse", e); }
      break;
    case "spinnaker":
      console.log(chalk.cyan("Spinnaker: ") + "spinnaker.io");
      break;
    case "tekton":
      try { execSync(`tkn ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tekton", e, "brew install tektoncd-cli"); }
      break;
    case "argocd":
      try { execSync(`argocd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("argocd", e, "brew install argocd"); }
      break;
    case "flux":
      try { execSync(`flux ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flux", e, "brew install fluxcd"); }
      break;
    case "jenkins-x": case "jx":
      try { execSync(`jx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jenkins-x", e); }
      break;

    // More Languages
    case "kotlin":
      try { execSync(`kotlin ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kotlin", e, "brew install kotlin"); }
      break;
    case "scalac": case "scala":
      try { execSync(`scala ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("scala", e, "brew install scala"); }
      break;
    case "groovysh": case "groovy":
      try { execSync(`groovysh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("groovy", e); }
      break;
    case "clojure": case "clj":
      try { execSync(`clojure ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("clojure", e, "brew install clojure"); }
      break;
    case "leiningen": case "lein":
      try { execSync(`lein ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("leiningen", e); }
      break;
    case "nbash": case "nushell": case "nu":
      try { execSync(`nu ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nushell", e, "brew install nushell"); }
      break;
    case "elixir": case "iex":
      try { execSync(`iex ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("elixir", e, "brew install elixir"); }
      break;
    case "mix":
      try { execSync(`mix ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mix", e); }
      break;
    case "phoenix": case "mix phx":
      try { execSync(`mix phx ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("phoenix", e); }
      break;
    case "erlang": case "erl":
      try { execSync(`erl ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("erlang", e, "brew install erlang"); }
      break;
    case "haskell": case "ghci": case "cabal": case "stack":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); }
      break;
    case "ocaml": case "opam":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); }
      break;
    case "fsharp": case "fsi":
      try { execSync(`dotnet fsi ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("fsharp", e); }
      break;
    case "racket": case "rkt":
      try { execSync(`racket ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("racket", e); }
      break;
    case "lua": case "luajit":
      try { execSync(`lua ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("lua", e, "brew install lua"); }
      break;
    case "lua-language-server": case "sumneko":
      console.log(chalk.cyan("Lua Language Server: ") + "github.com/sumneko/lua-language-server");
      break;
    case "nim": case "nimble":
      try { execSync(`nim ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nim", e); }
      break;
    case "crystal":
      try { execSync(`crystal ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("crystal", e); }
      break;
    case "v": case "vlang":
      try { execSync(`v ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vlang", e); }
      break;
    case "zig":
      try { execSync(`zig ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zig", e); }
      break;
    case "nix": case "nix-shell":
      try { execSync(`nix ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nix", e); }
      break;
    case "flakehub": case "flakes":
      console.log(chalk.cyan("FlakeHub: ") + "flakehub.com");
      break;
    case "direnv":
      try { execSync(`direnv ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("direnv", e, "brew install direnv"); }
      break;
    case "asdf":
      try { execSync(`asdf ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("asdf", e, "brew install asdf"); }
      break;
    case "sdkman":
      console.log(chalk.cyan("SDKMAN: ") + "sdkman.io");
      break;
    case "jenv":
      console.log(chalk.cyan("jEnv: ") + "jenv.github.io");
      break;
    case "rbenv": case "rvm": case "chruby":
      console.log(chalk.cyan("Ruby Version Manager: ") + "rvm.io / rbenv.github.io");
      break;
    case "phpenv": case "phpbrew":
      console.log(chalk.cyan("PHP Version Manager: ") + "phpbrew.github.io");
      break;

    // More Web Frameworks
    case "sails": case "sailsjs":
      try { execSync(`npm install -g sails && sails new ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sails", e); }
      break;
    case "loopback": case "lb4":
      try { execSync(`npm install -g @loopback/cli && lb4 app ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("loopback", e); }
      break;
    case "sveltekit":
      try { execSync(`npm create svelte@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sveltekit", e); }
      break;
    case "nuxt3": case "nuxt":
      try { execSync(`npx nuxi@latest init ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nuxt", e); }
      break;
    case "nextjs": case "next-app":
      try { execSync(`npx create-next-app@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nextjs", e); }
      break;
    case "remix-run":
      try { execSync(`npx create-remix@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("remix", e); }
      break;
    case "gatsby":
      try { execSync(`npx gatsby new ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gatsby", e); }
      break;
    case "eleventy": case "11ty":
      try { execSync(`npx @11ty/eleventy ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("eleventy", e); }
      break;
    case "hugo":
      try { execSync(`hugo new site ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hugo", e, "brew install hugo"); }
      break;
    case "jekyll":
      try { execSync(`bundle exec jekyll new ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("jekyll", e); }
      break;
    case "docusaurus":
      try { execSync(`npx create-docusaurus@latest ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("docusaurus", e); }
      break;
    case "vuepress":
      try { execSync(`npx vuepress dev ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vuepress", e); }
      break;
    case "vitepress":
      try { execSync(`npx vitepress init ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("vitepress", e); }
      break;
    case "storybook":
      try { execSync(`npx storybook@latest init ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("storybook", e); }
      break;
    case "vue-storefront": case "vsf":
      console.log(chalk.cyan("Vue Storefront: ") + "vuestorefront.io");
      break;
    case "nuxt-commerce":
      console.log(chalk.cyan("Nuxt Commerce: ") + "commerce.nuxt.com");
      break;

    // More Backend Frameworks
    case "spring-boot": case "spring":
      console.log(chalk.cyan("Spring Boot: ") + "start.spring.io");
      break;
    case "quarkus":
      try { execSync(`mvn io.quarkus.platform:quarkus-maven-plugin:create ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("quarkus", e); }
      break;
    case "micronaut":
      console.log(chalk.cyan("Micronaut: ") + "micronaut.io/launch");
      break;
    case "helidon":
      console.log(chalk.cyan("Helidon: ") + "helidon.io/starter");
      break;
    case "ktor":
      try { execSync(`gradle wrapper && ./gradlew build ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ktor", e); }
      break;
    case "play":
      console.log(chalk.cyan("Play Framework: ") + "playframework.com");
      break;
    case "lagom":
      console.log(chalk.cyan("Lagom: ") + "lagomframework.com");
      break;
    case "vertx": case "verticle":
      console.log(chalk.cyan("Vert.x: ") + "vertx.io");
      break;
    case "kTor": case "ktor":
      try { execSync(`ktor ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ktor", e); }
      break;
    case "actix-web": case "actix":
      console.log(chalk.cyan("Actix-web: ") + "actix.rs");
      break;
    case "axum":
      console.log(chalk.cyan("Axum: ") + "tokio.rs/axum");
      break;
    case "warp":
      console.log(chalk.cyan("Warp: ") + "seanmonstar.com/warp");
      break;
    case "rocket-rs": case "rocket":
      console.log(chalk.cyan("Rocket: ") + "rocket.rs");
      break;
    case "iron":
      console.log(chalk.cyan("Iron: ") + "ironframework.io");
      break;
    case "nickel-rs": case "nickel":
      console.log(chalk.cyan("Nickel: ") + "nickel.rs");
      break;

    // More Mobile
    case "react-native-cli":
      try { execSync(`npx react-native@latest init ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("react-native", e); }
      break;
    case "expo-cli": case "expo":
      try { execSync(`npx expo start ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("expo", e); }
      break;
    case "ionic-cli": case "ionic":
      try { execSync(`ionic start ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ionic", e); }
      break;
    case "capcli": case "capacitor":
      try { execSync(`npx cap ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("capacitor", e); }
      break;
    case "cordova-cli":
      try { execSync(`cordova create ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cordova", e); }
      break;
    case "nativescript":
      try { execSync(`tns create ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nativescript", e); }
      break;
    case "flutter-create":
      try { execSync(`flutter create ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flutter", e); }
      break;
    case "dart-create":
      try { execSync(`dart create ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dart", e); }
      break;
    case "swift-create":
      console.log(chalk.cyan("Swift: ") + "Use Xcode or swift package init");
      break;
    case "kotlin-create":
      console.log(chalk.cyan("Kotlin: ") + "start.kotlinlang.org");
      break;

    // More Databases
    case "postgres": case "postgresql":
      try { execSync(`psql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("postgres", e, "brew install postgresql"); }
      break;
    case "mysql": case "mariadb":
      try { execSync(`mysql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mysql", e, "brew install mysql"); }
      break;
    case "sqlite":
      try { execSync(`sqlite3 ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sqlite", e, "apt install sqlite3"); }
      break;
    case "mongodb": case "mongod":
      try { execSync(`mongod ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mongodb", e, "brew install mongodb"); }
      break;
    case "redis-server":
      try { execSync(`redis-server ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("redis", e, "brew install redis"); }
      break;
    case "cockroachdb": case "cockroach":
      try { execSync(`cockroach ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cockroachdb", e); }
      break;
    case "dynamodb-local":
      console.log(chalk.cyan("DynamoDB Local: ") + "docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html");
      break;
    case "cassandra": case "cqlsh":
      try { execSync(`cqlsh ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cassandra", e); }
      break;
    case "scylladb": case "scylla":
      console.log(chalk.cyan("ScyllaDB: ") + "scylladb.com");
      break;
    case "arangodb":
      try { execSync(`arangodb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("arangodb", e); }
      break;
    case "rethinkdb":
      try { execSync(`rethinkdb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("rethinkdb", e); }
      break;
    case "etcd":
      try { execSync(`etcd ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("etcd", e); }
      break;
    case "zookeeper":
      try { execSync(`zkServer ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("zookeeper", e); }
      break;
    case "hbase":
      console.log(chalk.cyan("HBase: ") + "hbase.apache.org");
      break;
    case "cassandra": case "datastax":
      console.log(chalk.cyan("DataStax: ") + "datastax.com");
      break;
    case "planetscale":
      console.log(chalk.cyan("PlanetScale: ") + "planetscale.com");
      break;
    case "turso":
      console.log(chalk.cyan("Turso: ") + "turso.tech");
      break;
    case "supabase-db":
      console.log(chalk.cyan("Supabase: ") + "supabase.com");
      break;
    case "neon-tech": case "neon":
      console.log(chalk.cyan("Neon: ") + "neon.tech");
      break;
    case "xata":
      console.log(chalk.cyan("Xata: ") + "xata.io");
      break;
    case "convex":
      console.log(chalk.cyan("Convex: ") + "convex.dev");
      break;
    case "fauna":
      console.log(chalk.cyan("Fauna: ") + "fauna.com");
      break;
    case "realm":
      console.log(chalk.cyan("Realm: ") + "realm.io");
      break;
    case "objectbox":
      console.log(chalk.cyan("ObjectBox: ") + "objectbox.io");
      break;
    case "pocketbase":
      try { execSync(`pocketbase ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pocketbase", e); }
      break;
    case "bumblebee": case "electric-sql":
      console.log(chalk.cyan("ElectricSQL: ") + "electric-sql.com");
      break;
    case "prisma-client":
      try { execSync(`npx prisma generate`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("prisma", e); }
      break;
    case "drizzle-orm":
      console.log(chalk.cyan("Drizzle ORM: ") + "orm.drizzle.team");
      break;
    case "knex":
      try { execSync(`npx knex ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("knex", e); }
      break;
    case "typeorm-cli":
      try { execSync(`typeorm ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("typeorm", e); }
      break;
    case "sequelize-cli":
      try { execSync(`npx sequelize-cli ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sequelize", e); }
      break;

    // More Data & Analytics
    case "spark": case "pyspark":
      try { execSync(`spark-submit ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("spark", e); }
      break;
    case "flink":
      try { execSync(`flink ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flink", e); }
      break;
    case "kafka":
      try { execSync(`kafka-topics ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("kafka", e); }
      break;
    case "airflow":
      try { execSync(`airflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("airflow", e, "pip install apache-airflow"); }
      break;
    case " Prefect":
      try { execSync(`prefect ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("prefect", e); }
      break;
    case "dagster":
      try { execSync(`dagster ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dagster", e); }
      break;
    case "meltano":
      try { execSync(`meltano ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("meltano", e); }
      break;
    case "airbyte":
      console.log(chalk.cyan("Airbyte: ") + "airbyte.com");
      break;
    case "fivetran":
      console.log(chalk.cyan("Fivetran: ") + "fivetran.com");
      break;
    case "stitch":
      console.log(chalk.cyan("Stitch: ") + "stitchdata.com");
      break;
    case "segment":
      console.log(chalk.cyan("Segment: ") + "segment.com");
      break;
    case "snowflake":
      try { execSync(`snowsql ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("snowflake", e); }
      break;
    case "bigquery":
      try { execSync(`bq ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bigquery", e); }
      break;
    case "redshift":
      console.log(chalk.cyan("Redshift: ") + "aws.amazon.com/redshift");
      break;
    case "trino": case "presto-query":
      try { execSync(`trino ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("trino", e); }
      break;
    case "duckdb":
      try { execSync(`duckdb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("duckdb", e); }
      break;
    case "clickhouse-client":
      try { execSync(`clickhouse-client ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("clickhouse", e); }
      break;
    case "druid":
      console.log(chalk.cyan("Apache Druid: ") + "druid.apache.org");
      break;
    case "pinot":
      console.log(chalk.cyan("Apache Pinot: ") + "pinot.apache.org");
      break;
    case "kylin":
      console.log(chalk.cyan("Apache Kylin: ") + "kylin.apache.org");
      break;
    case "impala":
      console.log(chalk.cyan("Apache Impala: ") + "impala.apache.org");
      break;
    case "hive": case "beeline":
      try { execSync(`hive ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("hive", e); }
      break;
    case "pig":
      try { execSync(`pig ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pig", e); }
      break;
    case "sqoop":
      try { execSync(`sqoop ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("sqoop", e); }
      break;
    case "flume":
      try { execSync(`flume-ng ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("flume", e); }
      break;
    case "nifi": case "nifi-api":
      try { execSync(`nifi ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("nifi", e); }
      break;
    case "streamsets":
      console.log(chalk.cyan("StreamSets: ") + "streamsets.com");
      break;
    case "talend":
      console.log(chalk.cyan("Talend: ") + "talend.com");
      break;
    case "informatica":
      console.log(chalk.cyan("Informatica: ") + "informatica.com");
      break;
    case "pentaho":
      console.log(chalk.cyan("Pentaho: ") + "pentaho.com");
      break;

    // More AI/ML
    case "pytorch": case "torch":
      try { execSync(`python -m torch ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("pytorch", e, "pip install torch"); }
      break;
    case "tensorflow": case "tf":
      try { execSync(`python -m tensorflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tensorflow", e, "pip install tensorflow"); }
      break;
    case "jax":
      try { execSync(`python -c "import jax; print(jax.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("jax", e, "pip install jax"); }
      break;
    case "keras":
      try { execSync(`python -c "import keras; print(keras.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("keras", e, "pip install keras"); }
      break;
    case "fastai":
      try { execSync(`python -c "import fastai; print(fastai.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("fastai", e, "pip install fastai"); }
      break;
    case "transformers":
      try { execSync(`python -c "import transformers; print(transformers.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("transformers", e, "pip install transformers"); }
      break;
    case "diffusers":
      try { execSync(`python -c "import diffusers; print(diffusers.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("diffusers", e, "pip install diffusers"); }
      break;
    case "langchain":
      try { execSync(`python -c "import langchain; print(langchain.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("langchain", e, "pip install langchain"); }
      break;
    case "llamaindex": case "llama-index":
      try { execSync(`python -c "import llama_index; print(llama_index.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("llamaindex", e, "pip install llama-index"); }
      break;
    case "autogen":
      try { execSync(`python -c "import autogen; print(autogen.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("autogen", e, "pip install pyautogen"); }
      break;
    case "crewai":
      try { execSync(`python -c "import crewai; print(crewai.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("crewai", e, "pip install crewai"); }
      break;
    case "guidance":
      try { execSync(`python -c "import guidance; print(guidance.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("guidance", e, "pip install guidance"); }
      break;
    case "inference-endpoint": case "inference":
      console.log(chalk.cyan("HuggingFace Inference Endpoints: ") + "huggingface.co/inference-endpoints");
      break;
    case "gradio":
      try { execSync(`python -c "import gradio; print(gradio.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("gradio", e, "pip install gradio"); }
      break;
    case "streamlit":
      try { execSync(`streamlit ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("streamlit", e, "pip install streamlit"); }
      break;
    case "dash":
      try { execSync(`python -c "import dash; print(dash.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("dash", e, "pip install dash"); }
      break;
    case "shiny":
      try { execSync(`python -c "import shiny; print(shiny.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("shiny", e, "pip install shiny"); }
      break;
    case "voila":
      try { execSync(`voila ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("voila", e, "pip install voila"); }
      break;
    case "panel":
      try { execSync(`python -c "import panel; print(panel.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("panel", e, "pip install panel"); }
      break;
    case "pytorch-lightning": case "lightning":
      try { execSync(`python -c "import lightning; print(lightning.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("lightning", e, "pip install lightning"); }
      break;
    case "pytorch-geometric": case "pyg":
      try { execSync(`python -c "import torch_geometric; print(torch_geometric.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("pyg", e, "pip install torch-geometric"); }
      break;
    case "optuna":
      try { execSync(`python -c "import optuna; print(optuna.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("optuna", e, "pip install optuna"); }
      break;
    case "ray": case "ray-tune":
      try { execSync(`python -c "import ray; print(ray.__version__)"`, { encoding: "utf-8" }); }
      catch (e: any) { handleError("ray", e, "pip install ray"); }
      break;
    case "weights-and-biases": case "wandb":
      try { execSync(`wandb ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("wandb", e, "pip install wandb"); }
      break;
    case "mlflow":
      try { execSync(`mlflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mlflow", e, "pip install mlflow"); }
      break;
    case "comet-ml": case "comet":
      try { execSync(`comet ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("comet", e); }
      break;
    case "neptune":
      try { execSync(`neptune ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("neptune", e, "pip install neptune"); }
      break;
    case "aimstack": case "aim":
      try { execSync(`aim ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("aim", e, "pip install aim"); }
      break;
    case "tensorboard":
      try { execSync(`tensorboard ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("tensorboard", e, "pip install tensorboard"); }
      break;
    case "clearml": case "allegroai":
      try { execSync(`clearml ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("clearml", e, "pip install clearml"); }
      break;
    case "guildai": case "guild":
      try { execSync(`guild ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("guild", e, "pip install guildai"); }
      break;
    case "dvc":
      try { execSync(`dvc ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("dvc", e, "pip install dvc"); }
      break;
    case "mlflow":
      try { execSync(`mlflow ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mlflow", e, "pip install mlflow"); }
      break;
    case "kubeflow":
      console.log(chalk.cyan("KubeFlow: ") + "kubeflow.org");
      break;
    case "seldon": case "seldon-core":
      console.log(chalk.cyan("Seldon: ") + "seldon.io");
      break;
    case "bentoml":
      try { execSync(`bentoml ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("bentoml", e, "pip install bentoml"); }
      break;
    case "cortex":
      try { execSync(`cortex ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("cortex", e); }
      break;
    case "mosec":
      try { execSync(`mosec ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("mosec", e); }
      break;
    case "text-generation-webui": case "oobabooga":
      console.log(chalk.cyan("Text Generation WebUI: ") + "github.com/oobabooga/text-generation-webui");
      break;
    case "lm-studio": case "lmstudio":
      console.log(chalk.cyan("LM Studio: ") + "lmstudio.ai");
      break;
    case "koboldcpp":
      console.log(chalk.cyan("KoboldCPP: ") + "github.com/LostRuins/koboldcpp");
      break;
    case "llamafile":
      console.log(chalk.cyan("Llamafile: ") + "github.com/Mozilla-Ocho/llamafile");
      break;
    case "gpt4all":
      try { execSync(`gpt4all ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("gpt4all", e); }
      break;
    case "ollama": case "ollama-run":
      try { execSync(`ollama ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("ollama", e, "brew install ollama"); }
      break;
    case "text-generation-webui": 
      console.log(chalk.cyan("Run: ") + "python one_click.py");
      break;

    default: 
      console.log(chalk.red(`✗ Unknown: ${cmd}`)); 
      console.log(chalk.gray("Type 'help' or '!cmd' for shell"));
  }
  return false;
}

function prompt() {
  rl.question(chalk.gray("devmate "), async (input: string) => {
    if (input.trim()) {
      commandHistory.push(input.trim());
      try { if (await handleCommand(input)) { rl.close(); return; } } 
      catch (e: any) { console.log(chalk.red(`Error: ${e.message}`)); }
    }
    prompt();
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    const result = await handleCommand(args.join(" "));
    if (result) { return; }
    process.exit(0);
  }
  
  console.clear();
  console.log(logo());
  console.log(chalk.gray("Type 'help' for commands, '!cmd' for shell\n"));
  process.on("SIGINT", () => { console.log(chalk.yellow("\n👋 Goodbye!")); process.exit(0); });
  prompt();
}

main().catch(console.error);
