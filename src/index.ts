#!/usr/bin/env bun

import readline from "readline";
import chalk from "chalk";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.gray("> "),
});

function logo(): string {
  return `
${chalk.red("██████╗ ███████╗██╗   ██╗███╗   ███╗ █████╗ ████████╗███████╗")}
${chalk.red("██╔══██╗██╔════╝██║   ██║████╗ ████║██╔══██╗╚══██╔══╝██╔════╝")}
${chalk.black("██║  ██║█████╗  ██║   ██║██╔████╔██║███████║   ██║   █████╗  ")}
${chalk.white("██║  ██║██╔══╝  ╚██╗ ██╔╝██║╚██╔╝██║██╔══██║   ██║   ██╔══╝  ")}
${chalk.grey("██████╔╝███████╗ ╚████╔╝ ██║ ╚═╝ ██║██║  ██║   ██║   ███████╗")}
${chalk.grey("╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝")}
${chalk.yellow("                      v3.0 - AI-Powered Developer CLI")}
`;
}

function help(): string {
  return `
${chalk.bold("📁 File Operations:")}
  ${chalk.green("ls")} [dir]     - List files
  ${chalk.green("cat")} <file>   - Read file
  ${chalk.green("cd")} <dir>    - Change directory
  ${chalk.green("pwd")}          - Print working directory

${chalk.bold("🔧 Git:")}
  ${chalk.green("git")} <cmd>    - Run git command
  ${chalk.green("status")}       - Git status

${chalk.bold("🤖 AI:")}
  ${chalk.green("ask")} <q>      - Ask AI assistant (using OpenCode)
  ${chalk.green("ai")} <q>       - Ask AI assistant

${chalk.bold("⚙️  System:")}
  ${chalk.green("clear")}        - Clear screen
  ${chalk.green("exit")}         - Exit DevMate

${chalk.gray("Type 'help' for this list")}
`;
}

async function handleCommand(input: string): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? "";
  const args = parts.slice(1);

  switch (cmd) {
    case "help":
    case "?":
      console.log(help());
      break;
    case "ls":
      try {
        const dir = args[0] || ".";
        const output = execSync(`ls -la "${dir}"`, { encoding: "utf-8" });
        console.log(output);
      } catch (e: any) {
        console.log(chalk.red(`Error: ${e.message}`));
      }
      break;
    case "cat":
      if (!args[0]) {
        console.log(chalk.red("Usage: cat <file>"));
        break;
      }
      try {
        if (!existsSync(args[0])) {
          console.log(chalk.red(`File not found: ${args[0]}`));
          break;
        }
        const content = readFileSync(args[0], "utf-8");
        console.log(content);
      } catch (e: any) {
        console.log(chalk.red(`Error: ${e.message}`));
      }
      break;
    case "cd":
      const targetDir = args[0] || process.env.HOME || "/";
      try {
        process.chdir(targetDir);
        console.log(chalk.green(`Changed to ${process.cwd()}`));
      } catch (e: any) {
        console.log(chalk.red(`Error: ${e.message}`));
      }
      break;
    case "pwd":
      console.log(process.cwd());
      break;
    case "clear":
    case "cls":
      console.clear();
      break;
    case "exit":
    case "quit":
    case "q":
      console.log(chalk.yellow("Goodbye! 👋"));
      return true;
    case "ask":
    case "ai":
      if (!args[0]) {
        console.log(chalk.red("Usage: ask <question>"));
        break;
      }
      await handleAI(args.join(" "));
      break;
    case "git":
      const gitCmd = args.join(" ");
      try {
        const gitOutput = execSync(`git ${gitCmd}`, { encoding: "utf-8" });
        console.log(gitOutput);
      } catch (e: any) {
        console.log(chalk.red(`Git error: ${e.message}`));
      }
      break;
    case "":
      break;
    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      console.log(chalk.gray("Type 'help' for available commands"));
  }
  return false;
}

async function handleAI(question: string): Promise<void> {
  console.log(chalk.cyan("🤖 Asking OpenCode AI..."));
  
  try {
    const opencodePath = "/home/runner/workspace/.config/npm/node_global/bin/opencode";
    const output = execSync(
      `${opencodePath} run "${question.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    
    console.log(chalk.cyan("\n🤖 Response:"));
    console.log(output);
  } catch (e: any) {
    console.log(chalk.red(`AI Error: ${e.message}`));
  }
}

async function prompt(): Promise<void> {
  rl.question(chalk.gray("> "), async (input: string) => {
    if (input.trim()) {
      try {
        const shouldExit = await handleCommand(input);
        if (shouldExit) {
          rl.close();
          return;
        }
      } catch (e: any) {
        console.log(chalk.red(`Error: ${e.message}`));
      }
    }
    prompt();
  });
}

async function main(): Promise<void> {
  console.clear();
  console.log(logo());
  console.log(chalk.gray("Type 'help' for commands\n"));
  
  process.on("SIGINT", () => {
    console.log(chalk.yellow("\nGoodbye! 👋"));
    process.exit(0);
  });
  
  prompt();
}

main().catch(console.error);
