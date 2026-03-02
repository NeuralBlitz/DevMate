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

const rl = readline.createInterface({
  input: process.stdin, output: process.stdout, 
  prompt: chalk.gray("devmate ")
});

const COMPLETIONS = [
  "help","ls","cd","cat","pwd","mkdir","rm","touch","cp","mv","ln","tree",
  "grep","find","which","locate","rg","fd","bat","exa","eza","lf","yazi",
  "git","status","branches","graph","diff","log","commit","push","pull",
  "checkout","merge","rebase","stash","fetch","rebase","reset","restore",
  "ask","ai","opencode-ai","chatgpt","claude",
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
  pkg <cmd>         Termux (Android)
  apk <cmd>         Alpine (iSH)

${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.magenta("🐳 CONTAINERS & ☸️ KUBERNETES")}
${chalk.bold.magenta("══════════════════════════════════════════════════════════════════════════")}
  docker <cmd>      Docker CLI
  podman <cmd>      Podman
  kubectl <cmd>     Kubernetes CLI (k)
  helm <cmd>        K8s package manager

${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.cyan("☁️ CLOUD & DEVOPS")}
${chalk.bold.cyan("══════════════════════════════════════════════════════════════════════════")}
  aws <cmd>         AWS CLI
  gcloud <cmd>      Google Cloud
  az <cmd>          Azure CLI
  terraform <cmd>   Terraform
  ansible <cmd>     Ansible
  vagrant <cmd>     Vagrant

${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.green("💻 SYSTEM & PROCESSES")}
${chalk.bold.green("══════════════════════════════════════════════════════════════════════════")}
  ps                 List processes
  top/htop          Task manager
  kill <pid>        Kill process
  free              Memory usage
  df/du             Disk usage

${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.yellow("🌐 NETWORKING")}
${chalk.bold.yellow("══════════════════════════════════════════════════════════════════════════")}
  ping <host>       Ping host
  curl/wget <url>  HTTP/Download
  ssh <host>        SSH connect
  dig <domain>      DNS lookup

${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.red("🗜️ ARCHIVES & 🔐 CRYPTO")}
${chalk.bold.red("══════════════════════════════════════════════════════════════════════════")}
  tar -czf <f> <d>  Create tar.gz
  zip/unzip         Zip files
  7z                 7-Zip
  md5sum/sha256sum  Checksums
  base64            Encode/decode

${chalk.bold.blue("══════════════════════════════════════════════════════════════════════════")}
${chalk.bold.blue("🎮 GAMES & FUN")}
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
${chalk.gray("💡 Tips: !<cmd> for shell, Tab autocomplete, ↑↓ history")}
${chalk.gray("══════════════════════════════════════════════════════════════════════════")}
`;
}

function getVersion() {
  return "3.0.0";
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
      
    case "tree": try { console.log(execSync(`tree -L ${args[1] || 2} "${args[0] || "."}"`, { encoding: "utf-8" })); }
      catch { handleError("tree", {message: "not found"}, "sudo apt install tree"); } break;
      
    case "grep": case "rg": case "find": case "which": case "locate": case "fd":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); } break;
      
    case "awk": case "sed": case "sort": case "uniq": case "cut": case "tr": case "wc":
      try { execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError(cmd, e); } break;
      
    case "git": try { execSync(`git ${args.join(" ")}`, { encoding: "utf-8", stdio: "inherit" }); }
      catch (e: any) { handleError("git", e); } break;
      
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
        spawn(OPENCODE_PATH, ["tui"], { stdio: "inherit", cwd: process.cwd() }).on("close", () => {
          console.clear(); console.log(logo()); info("Returned to DevMate\n"); prompt();
        });
      } catch (e: any) { handleError("opencode", e, "Install opencode"); prompt(); }
      return true;
      
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
