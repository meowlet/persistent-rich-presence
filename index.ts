import { Client, CustomStatus, RichPresence } from "discord.js-selfbot-v13";
import { config as dotenvConfig } from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

dotenvConfig();

const config = JSON.parse(
  readFileSync(join(process.cwd(), "config.json"), "utf-8")
);

interface AdobeApp {
  name: string;
  details: string;
  state: string;
  type:
    | "PLAYING"
    | "STREAMING"
    | "LISTENING"
    | "WATCHING"
    | "CUSTOM"
    | "COMPETING";
  largeImage: string;
  largeImageText: string;
  smallImage: string;
  smallImageText: string;
  url: string;
  buttons: Array<{ name: string; url: string }>;
  projects: Array<{
    name: string;
    details: string;
  }>;
}

interface Config {
  discord: {
    applicationId: string;
    customStatus: {
      state: string;
      emoji: string;
    };
  };
  rotationInterval: number;
  adobeApps: AdobeApp[];
}

class AdobeRichPresence {
  private client: Client;
  private config: Config;
  private currentAppIndex: number = 0;
  private currentProjectIndex: number = 0;
  private rotationTimer?: NodeJS.Timeout;
  private startTime: Date;

  constructor() {
    this.client = new Client();
    this.config = config;
    this.startTime = new Date();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on("ready", () => {
      console.log(`${this.client.user?.username} is ready!`);
      this.startRotation();
    });

    process.on("SIGINT", () => {
      console.log("\nShutting down gracefully...");
      this.cleanup();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\nShutting down gracefully...");
      this.cleanup();
      process.exit(0);
    });
  }

  private cleanup(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
    console.log("Cleanup completed");
  }

  private getRandomProject(app: AdobeApp): { name: string; details: string } {
    if (!app.projects || app.projects.length === 0) {
      return {
        name: "Untitled project",
        details: "Working on creative content",
      };
    }
    const project =
      app.projects[Math.floor(Math.random() * app.projects.length)];
    return (
      project || {
        name: "Untitled project",
        details: "Working on creative content",
      }
    );
  }

  private createCustomStatus(): CustomStatus {
    return new CustomStatus(this.client)
      .setState(this.config.discord.customStatus.state)
      .setEmoji(this.config.discord.customStatus.emoji);
  }

  private createRichPresence(): RichPresence {
    const currentApp = this.config.adobeApps[this.currentAppIndex];

    if (!currentApp) {
      throw new Error(`Invalid app index: ${this.currentAppIndex}`);
    }

    const randomProject = this.getRandomProject(currentApp);
    const applicationId =
      process.env.DISCORD_APP_ID || this.config.discord.applicationId;

    const richPresence = new RichPresence(this.client)
      .setApplicationId(applicationId)
      .setType(currentApp.type)
      .setName(currentApp.name)
      .setDetails(randomProject.name)
      .setState(randomProject.details)
      .setAssetsLargeImage(currentApp.largeImage)
      .setAssetsLargeText(currentApp.largeImageText)
      .setURL(currentApp.url)
      .setStartTimestamp(this.startTime);

    if (currentApp.buttons && currentApp.buttons.length > 0) {
      currentApp.buttons.forEach((button) => {
        richPresence.addButton(button.name, button.url);
      });
    }

    return richPresence;
  }

  private updatePresence(): void {
    try {
      const customStatus = this.createCustomStatus();
      const richPresence = this.createRichPresence();
      const currentApp = this.config.adobeApps[this.currentAppIndex];

      if (!currentApp) {
        console.error("Invalid app index:", this.currentAppIndex);
        return;
      }

      this.client.user?.setPresence({
        activities: [customStatus.toJSON(), richPresence.toJSON()],
        status: "online",
      });

      console.log(`Updated Rich Presence: ${currentApp.name}`);
    } catch (error) {
      console.error("Error updating presence:", error);
    }
  }

  private startRotation(): void {
    this.updatePresence();
    console.log("Rich Presence is now active!");

    this.rotationTimer = setInterval(() => {
      this.currentAppIndex =
        (this.currentAppIndex + 1) % this.config.adobeApps.length;
      this.updatePresence();
    }, this.config.rotationInterval);
  }

  public async start(): Promise<void> {
    const token = process.env.TOKEN;

    if (!token) {
      console.error("Discord token not found in .env file!");
      console.log("Please add your Discord user token to the .env file:");
      console.log("   TOKEN=your_discord_user_token_here");
      process.exit(1);
    }

    try {
      console.log("Starting Adobe Rich Presence...");
      await this.client.login(token);
    } catch (error) {
      console.error("Failed to login to Discord:", error);
      console.log("\nMake sure your token is valid and Discord is accessible.");
      console.log(
        "To get your token: Discord → F12 → Application → Local Storage → discord.com → token"
      );
      process.exit(1);
    }
  }

  public switchToApp(appName: string): void {
    const appIndex = this.config.adobeApps.findIndex((app) =>
      app.name.toLowerCase().includes(appName.toLowerCase())
    );

    if (appIndex !== -1) {
      this.currentAppIndex = appIndex;
      this.updatePresence();
      const app = this.config.adobeApps[appIndex];
      if (app) {
        console.log(`Manually switched to: ${app.name}`);
      }
    } else {
      console.log(`App not found: ${appName}`);
      console.log(
        "Available apps:",
        this.config.adobeApps.map((app) => app.name).join(", ")
      );
    }
  }
}

const adobePresence = new AdobeRichPresence();

adobePresence.start().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export default AdobeRichPresence;
