# DevMate v3.0 🚀 - OMNI-SHELL

## The Ultimate Cross-Platform CLI That Connects Everything

**Any Shell • Any Command • Any Platform • Any Device**

DevMate is the most comprehensive CLI ever built - connecting 600+ tools, services, and platforms into one unified interface. From messaging apps to cloud infrastructure, from AI models to blockchain, from edge computing to serverless - it's all here.

---

## ⭐ Features

- **600+ Commands** across all platforms and services
- **50+ Smart Aliases** for common operations
- **Universal Messaging** - Send to Telegram, Discord, Slack, WhatsApp, and more
- **AI/ML Platform Integration** - OpenAI, Claude, Gemini, HuggingFace, and 20+ more
- **Google Ecosystem** - GCP, Firebase, Flutter, Vertex AI, Dart
- **GitHub/GitLab Complete** - Actions, workflows, codespaces, releases
- **Cloud Storage** - Dropbox, OneDrive, Google Drive, S3
- **Serverless Deploy** - Vercel, Netlify, Railway, Supabase, Cloudflare Workers
- **Kubernetes & Edge** - K3s, K3d, MicroK8s, Nomad
- **Remote Development** - Replit, Cursor, Codespaces, Gitpod, Jupyter
- **Mobile Development** - Flutter, React Native, Expo, Capacitor
- **Infrastructure as Code** - Terraform, Pulumi, Ansible, AWS CDK
- **Security & Secrets** - Vault, Doppler, Bitwarden, Age
- **Monitoring** - Prometheus, Grafana, Datadog, New Relic
- **Blockchain & Web3** - Solana, Ethereum, Hardhat, IPFS
- **Data Engineering** - Airflow, DBT, Spark, Snowflake, BigQuery
- **Machine Learning** - PyTorch, TensorFlow, HuggingFace Transformers
- **CI/CD** - Jenkins, CircleCI, GitLab CI, ArgoCD
- **Custom Systems** - Commands, Snippets, Bookmarks, Sessions
- **Tab Autocomplete** - 500+ completions

---

## 🚀 Quick Start

```bash
# Install
bun install

# Run
bun run src/index.ts

# Or install globally
bun link
devmate
```

---

## 📋 All Commands

### 📁 File Operations
```
ls, ll, la, l, lt        # List files with details
cd <dir>                 # Change directory
cat, head, tail, less    # View files
pwd                      # Print working directory
mkdir <dir>              # Create directory
rm <file|dir>           # Remove files/directories
touch <file>            # Create empty file
cp, mv                  # Copy/Move files
ln                       # Create symlinks
tree [dir]              # Directory tree
grep, rg, find, which   # Search tools
```

### 🔴 Git & Version Control
```
git <cmd>                # Run any git command
status, branches, log   # Git status/info
diff, staged            # View changes
commit <msg>            # Commit changes
push, pull              # Sync with remote
checkout <branch>       # Switch branches
git-init, git-clone     # Initialize/clone
git-undo, git-clean    # Undo operations
gh <cmd>                # GitHub CLI
gh-run, gh-workflow    # GitHub Actions
gh-pr, gh-issue        # PRs and Issues
glab <cmd>              # GitLab CLI
```

### 🤖 AI/ML Platforms
```
openai <prompt>          # OpenAI GPT
claude <prompt>          # Anthropic Claude
gemini <prompt>          # Google Gemini
vertex                   # Vertex AI
huggingface <model>     # HuggingFace Hub
hf-inference            # HF Inference API
cohere <prompt>         # Cohere AI
openrouter <prompt>     # OpenRouter.ai
replicate <model>       # Replicate
langchain               # LangChain CLI
flowise                 # Flowise AI
botpress                # Botpress
datarobot              # DataRobot
kimi <prompt>           # Kimi AI (Moonshot)
jules <prompt>          # Jules AI
bedrock <prompt>        # AWS Bedrock
together <prompt>       # Together.ai
perplexity <query>      # Perplexity AI
langgraph               # LangGraph
crewai                  # CrewAI
autogen                 # AutoGen
ask, ai                 # Universal AI ask
opencode-ai             # OpenCode AI Assistant
```

### 🔵 Google Ecosystem
```
gcloud <cmd>             # Google Cloud CLI
vertex                   # Vertex AI
firebase                 # Firebase CLI
flutter <cmd>            # Flutter SDK
dart <cmd>              # Dart language
gemini                   # Gemini AI
google-auth              # Google Auth
gsutil <cmd>            # GCS utilities
google-play             # Google Play
google-apps-script      # GAS Editor
gcp                      # Alias for gcloud
```

### 💬 Messaging & Social
```
telegram <msg>          # Send Telegram message
telegram-file <f>       # Send file
telegram-bot            # Bot commands
discord <msg>           # Discord message
discord-webhook         # Webhook send
discord-bot             # Bot API
discord-channel         # Channel messages
slack <msg>             # Slack message
slack-webhook           # Slack webhook
whatsapp <msg>          # WhatsApp message
whatsapp-send          # WhatsApp Business
messenger               # Facebook Messenger
facebook-post           # Facebook post
twitter-post <txt>      # Twitter/X post
tiktok-post            # TikTok upload
groupme                 # GroupMe
manychat                # ManyChat bot
imessage                # iMessage (macOS)
sms                     # SMS via email
send <service> <msg>    # Universal sender
msg <svc> <msg>        # Quick send
```

### ⛓️ Blockchain & Web3
```
solana <cmd>             # Solana blockchain
ethers                  # Ethers.js
hardhat                 # Ethereum dev environment
truffle                 # Truffle framework
foundry                 # Foundry
web3js                  # Web3.js
ipfs                    # IPFS
filecoin                # Filecoin
arweave                 # Arweave
alchemy                 # Alchemy API
infura                  # Infura
```

### 📊 Data Engineering
```
airflow                  # Apache Airflow
dbt                      # Data build tool
spark                    # Apache Spark
pyspark                  # PySpark
duckdb                   # DuckDB
polars                   # Polars
dask                     # Dask
presto                   # Presto/Trino
snowflake                # Snowflake
bigquery                 # BigQuery
mlflow                   # MLflow
wandb                    # Weights & Biases
```

### 🧠 Machine Learning
```
pytorch                  # PyTorch
tensorflow              # TensorFlow
keras                    # Keras
sklearn                 # Scikit-learn
jax                      # JAX
onnx                     # ONNX
transformers            # HuggingFace Transformers
diffusers               # Diffusers
xgboost                  # XGBoost
lightgbm                # LightGBM
catboost                # CatBoost
fastai                  # FastAI
ultralytics            # Ultralytics
```

### 🔄 CI/CD Pipelines
```
jenkins                  # Jenkins
circleci                 # CircleCI
travis                   # Travis CI
gitlab-runner            # GitLab CI
drone                   # Drone CI
buildkite               # Buildkite
azure-pipelines         # Azure Pipelines
```

### 🐳 Container Orchestration
```
docker <cmd>             # Docker CLI
podman                   # Podman
containerd               # containerd
crictl                  # CRI ctl
nerdctl                 # Nerdctl
buildah                  # Buildah
skopeo                   # Skopeo
docker-compose          # Compose (dc)
kubectl <cmd>            # Kubernetes
helm <cmd>              # Helm charts
k9s                      # K9s dashboard
istio <cmd>              # Istio
argocd <cmd>            # ArgoCD
flux <cmd>               # Flux CD
```

### 🔀 Service Mesh & Proxies
```
linkerd                  # Linkerd
consul                   # Consul
nomad                    # Nomad
traefik                  # Traefik
envoy                    # Envoy
nginx                    # Nginx
haproxy                 # HAProxy
caddy                    # Caddy
```

### 📨 Messaging Queues
```
rabbitmq                 # RabbitMQ
kafka                    # Apache Kafka
pulsar                   # Apache Pulsar
nats                     # NATS
activemq                 # ActiveMQ
```

### 🔍 Search Engines
```
elasticsearch            # Elasticsearch
meilisearch            # MeiliSearch
typesense              # Typesense
opensearch             # OpenSearch
solr                    # Solr
algolia                # Algolia
```

### 💾 Cache & KV Stores
```
redis                    # Redis
memcached               # Memcached
etcd                    # etcd
consul                   # Consul
dynamodb                # DynamoDB
```

### 🔌 API Gateways & ORMs
```
kong                     # Kong API Gateway
tyk                      # Tyk
graphql                  # GraphQL
apollo                   # Apollo Server
hasura                   # Hasura
prisma                   # Prisma ORM
drizzle                  # Drizzle ORM
knex                     # Knex.js
typeorm                  # TypeORM
```

### 📈 Monitoring & Tracing
```
prometheus              # Prometheus
alertmanager            # AlertManager
thanos                  # Thanos
loki                    # Grafana Loki
grafana                 # Grafana
kibana                  # Kibana
jaeger                  # Jaeger
zipkin                  # Zipkin
tempo                   # Grafana Tempo
datadog <cmd>           # Datadog
newrelic                # New Relic
sentry                  # Sentry
```

### 📝 Logging
```
fluentd                  # Fluentd
fluent-bit               # Fluent Bit
logstash                # Logstash
filebeat                # Filebeat
metricbeat              # Metricbeat
journalbeat             # Journalbeat
```

### 🔐 Identity & Auth
```
vault                    # HashiCorp Vault
keycloak                # Keycloak
okta                     # Okta
auth0                    # Auth0
clerk                    # Clerk
cognito                  # AWS Cognito
supabase-auth           # Supabase Auth
firebase-auth           # Firebase Auth
```

### 🌐 CDN & DNS
```
cloudflare               # Cloudflare
fastly                   # Fastly
cloudfront              # CloudFront
route53                  # Route 53
dnsmasq                  # Dnsmasq
coredns                  # CoreDNS
```

### 🖥️ Virtualization
```
vagrant                  # Vagrant
virtualbox              # VirtualBox
vmware                   # VMware
qemu                     # QEMU
libvirt                  # Libvirt
proxmox                 # Proxmox
```

### 🔍 Code Analysis & Security
```
sonarqube               # SonarQube
codacy                   # Codacy
codeclimate             # Code Climate
snyk                    # Snyk
dependabot              # Dependabot
renovate                # Renovate
trivy                   # Trivy
```

### 🔨 Build Tools
```
make                     # Make
cmake                    # CMake
meson                    # Meson
ninja                    # Ninja
gradle                   # Gradle
maven                    # Maven
bazel                    # Bazel
just                     # Just
task                     # Task (Taskfile)
```

### ⚡ Runtimes & Languages
```
node                     # Node.js
deno                     # Deno
bun                      # Bun
python                   # Python
go                       # Go
java                     # Java
kotlin                   # Kotlin
scala                    # Scala
ruby                     # Ruby
php                      # PHP
rust                     # Rust
zig                      # Zig
nim                      # Nim
julia                    # Julia
r                        # R
```

### ☁️ Serverless & Functions
```
aws-lambda               # AWS Lambda
google-functions         # GCP Functions
azure-functions          # Azure Functions
vercel <cmd>            # Vercel
netlify <cmd>           # Netlify
cloudflare-workers      # CF Workers
flyctl <cmd>            # Fly.io
railway <cmd>           # Railway
render <cmd>            # Render
heroku <cmd>            # Heroku
supabase <cmd>          # Supabase
```

### 🖥️ Remote Dev & Cloud IDE
```
replit <cmd>             # Replit
codespaces               # GitHub Codespaces
gitpod                   # Gitpod
jupyter                  # Jupyter Lab
colab                    # Google Colab
kaggle                   # Kaggle
binder                   # Binder
cursor                   # Cursor IDE
```

### 📱 Mobile & Cross-Platform
```
expo <cmd>               # Expo (React Native)
react-native             # React Native CLI
cordova                  # Cordova
ionic                    # Ionic
capacitor                # Capacitor
flutter <cmd>            # Flutter
flutter-build            # Flutter build
xcode-select             # Xcode tools
adb <cmd>                # Android Debug
fastlane                 # Fastlane
appcenter               # MS App Center
```

### 🍎 Apple Ecosystem
```
shortcuts <name>         # iPhone Shortcuts
apple-script             # Run AppleScript
xcodebuild              # Xcode build
swift <cmd>             # Swift
swiftui                  # SwiftUI
spotlight <query>       # Spotlight search
imessage                 # iMessage
```

### 💻 IDE & Editors
```
code <file>              # VS Code
cursor                   # Cursor IDE
vscodium                 # VSCodium
sublime <file>          # Sublime Text
jetbrains <ide>         # JetBrains IDEs
emacs <file>            # Emacs
helix <file>            # Helix editor
zed <file>              # Zed editor
```

### 📓 Productivity & Notes
```
notion <cmd>             # Notion API
obsidian <note>         # Obsidian vault
typora <cmd>            # Typora
zotero <cmd>            # Zotero
logseq <cmd>            # Logseq
```

### ☁️ Cloud Storage
```
dropbox <cmd>            # Dropbox CLI
onedrive <cmd>          # OneDrive
gdrive                   # Google Drive
box <cmd>                # Box.com
s3 <cmd>                # AWS S3
s3cp <src> <dst>        # S3 copy
s3ls                     # S3 list
rclone                   # Rclone sync
```

### 🎨 Design & Wireframing
```
figma <cmd>              # Figma CLI
miro <cmd>              # Miro boards
excalidraw               # Excalidraw
lucid <cmd>             # Lucidchart
drawio                   # Draw.io
```

### 📐 Diagrams & Mapping
```
plantuml                 # PlantUML
mermaid                  # Mermaid charts
graphviz                 # Graphviz
```

### 📸 Content Creation
```
midjourney <prompt>     # Midjourney (via API)
dalle <prompt>         # DALL-E images
stable-diffusion        # Stable Diffusion
canva <cmd>            # Canva
elevenlabs <text>      # ElevenLabs audio
```

### 🎬 Video & Podcast
```
obs <cmd>               # OBS Studio
davinci <cmd>           # DaVinci Resolve
ffmpeg <cmd>            # FFmpeg
kdenlive                # Kdenlive
audacity                # Audacity
```

### 🧪 Testing & QA
```
cypress <cmd>           # Cypress
playwright <cmd>        # Playwright
puppeteer <cmd>         # Puppeteer
selenium <cmd>          # Selenium
jest <cmd>              # Jest
vitest                   # Vitest
mocha <cmd>             # Mocha
pytest <cmd>           # PyTest
rspec <cmd>             # RSpec
```

### 📦 Package Registries
```
npm <cmd>               # npm
yarn <cmd>              # Yarn
pnpm <cmd>              # pnpm
bun <cmd>              # Bun
pip <cmd>              # PyPI
cargo <cmd>            # crates.io
gem <cmd>              # RubyGems
composer <cmd>          # Packagist
maven <cmd>            # Maven
```

### 🎮 Gaming & Streams
```
steam <cmd>             # Steam CLI
lutris                  # Lutris gaming
obs <cmd>               # OBS Studio
tauri <cmd>            # Tauri apps
```

### 💼 Business & Productivity
```
slack <cmd>             # Slack
teams <cmd>             # MS Teams
zoom <cmd>              # Zoom
airtable <cmd>         # Airtable
hubspot <cmd>          # HubSpot
salesforce <cmd>       # Salesforce
```

### 🎯 Custom Commands & Sessions
```
cmd add <name> <cmd>   # Add custom command
cmd list               # List commands
cmd del <name>         # Delete command
alias add <name> <cmd> # Add alias
session save/load      # Sessions
snippet add/run/del    # Code snippets
bookmark add/cd/del   # Bookmarks
```

### ⚡ Quick Actions
```
ip                      # Show IP address
weather                 # Show weather
qr <text>              # Generate QR code
passgen [n]            # Generate password
timestamp              # Current timestamp
uuid                   # Generate UUID
base64                 # Base64 encode/decode
url-encode             # URL encode
json-format            # Format JSON
```

### ⚙️ System Info & Maintenance
```
sysinfo                 # System info
htop                    # Process monitor
btop                    # Btop
glances                 # Glances
neofetch               # Neofetch
speedtest              # Speedtest
docker-clean           # Clean Docker
npm-clean              # Clean npm cache
apt-clean              # Clean apt
ncdu                   # NCurses du
```

---

## 🔧 Configuration

### Environment Variables

```bash
# AI Platforms
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-...
export GEMINI_API_KEY=AI...
export HF_TOKEN=hf_...
export OPENROUTER_API_KEY=...

# Messaging
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID=...
export DISCORD_WEBHOOK=...
export SLACK_WEBHOOK=...

# Cloud
export GCP_PROJECT=...
export AWS_REGION=us-east-1
export AZURE_SUBSCRIPTION=...

# Security
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=...

# Storage
export RESTIC_REPO=/path/to/repo
export RESTIC_PASSWORD=...
```

---

## 🛠️ Installation

```bash
# Clone and install
git clone https://github.com/your-repo/devmate.git
cd devmate
bun install

# Make global
bun link

# Or use installer
bash install-devmate.sh
```

---

## 📁 Project Structure

```
devmate/
├── src/
│   └── index.ts         # Main CLI (4500+ lines)
├── install-devmate.sh   # Installer
├── ROADMAP.md          # Future plans
├── devmate-tui/        # Go-based TUI
└── README.md           # This file
```

---

## 💡 Usage Examples

```bash
# Send a message
devmate telegram "Hello World"
devmate discord "Deployment complete!"

# AI queries
devmate openai "Explain quantum computing"
devmate claude "Write a Python function"
devmate gemini "What's the weather?"

# Cloud operations
devmate gcloud compute instances list
devmate aws s3 ls
devmate terraform apply

# Kubernetes
devmate k get pods -A
devmate helm install myrelease stable/chart
devmate k9s

# Deploy
devmate vercel deploy
devmate netlify deploy

# Development
devmate new react my-app
devmate cursor .
devmate expo start

# Monitoring
devmate prometheus metrics
devmate grafana dashboards
devmate htop

# Blockchain
devmate hardhat node
devmate ethers deploy

# Data Engineering
devmate dbt run
devmate spark-submit

# ML
devmate pytorch train
devmate transformers download
```

---

## 🎯 Tips

- Use `!cmd` to run raw shell commands
- Tab autocomplete available for all commands
- Up/Down arrow for command history
- Custom commands persist across sessions
- Set env vars in `~/.bashrc` or `~/.zshrc`
- Use `--version` or `-v` to check version
- Use `--help` or `-h` for help

---

## 📈 Stats

- **4,500+ Lines** of TypeScript
- **600+ Commands** across all categories
- **50+ Smart Aliases**
- **20+ Messaging Platforms**
- **20+ AI/ML Providers**
- **30+ Programming Languages**
- **All Major Clouds** supported
- **All Major DevOps Tools** supported

---

## 🤝 Contributing

Open issues or PRs welcome!

## 📄 License

MIT License

---

**DevMate** - Anything. Anywhere. Anytime. 🚀
