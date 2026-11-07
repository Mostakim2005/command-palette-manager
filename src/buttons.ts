import { Platform, setIcon, setTooltip } from "obsidian";
import type { App, Menu } from "obsidian";
import type CommandPaletteManagerPlugin from "./main";

/**
 * Injects pinned commands into five targets: note header, ribbon, status bar,
 * editor context menu and file explorer menu.
 */
export class ButtonInjector {
	ribbonEls: HTMLElement[] = [];
	statusBarEls: HTMLElement[] = [];

	constructor(
		public app: App,
		public plugin: CommandPaletteManagerPlugin,
	) {}

	isDeviceMatch(deviceMode: string): boolean {
		if (!deviceMode || deviceMode === "all") return true;
		if (deviceMode === "desktop") return !Platform.isMobile;
		if (deviceMode === "mobile") return Boolean(Platform.isMobile);
		return true;
	}

	syncButtons(): void {
		this.clearInjectedButtons();
		const buttons = (this.plugin.settings.pinnedButtons || []).filter((b) =>
			this.isDeviceMatch(b.device),
		);

		buttons.forEach((btn) => {
			if (btn.location === "ribbon") {
				const el = this.plugin.addRibbonIcon(
					btn.icon || "terminal",
					btn.tooltip || btn.label || btn.commandId,
					() => this.plugin.registry.executeCommandSafe(btn.commandId),
				);
				el.addClass("cpm-injected-ribbon-btn");
				if (btn.color) el.style.color = btn.color;
				this.ribbonEls.push(el);
			} else if (btn.location === "statusbar") {
				const item = this.plugin.addStatusBarItem();
				item.addClass("cpm-statusbar-btn");
				const iconSpan = item.createSpan({ cls: "cpm-svg" });
				setIcon(iconSpan, btn.icon || "terminal");
				if (btn.color) iconSpan.style.color = btn.color;
				if (btn.displayMode === "both" && btn.label) {
					item.createSpan({ cls: "cpm-statusbar-label", text: btn.label });
				}
				setTooltip(item, btn.tooltip || btn.label || btn.commandId);
				item.addEventListener("click", () => {
					this.plugin.registry.executeCommandSafe(btn.commandId);
				});
				this.statusBarEls.push(item);
			}
		});

		this.injectHeaderButtons();
	}

	injectHeaderButtons(): void {
		const headerButtons = (this.plugin.settings.pinnedButtons || []).filter(
			(b) => b.location === "header" && this.isDeviceMatch(b.device),
		);

		this.app.workspace.iterateAllLeaves((leaf) => {
			const actionsContainer = (leaf.view as unknown as { containerEl?: HTMLElement })
				?.containerEl?.querySelector<HTMLElement>(".view-actions");
			if (!actionsContainer) return;

			let group = actionsContainer.querySelector<HTMLElement>(".cpm-header-actions-group");

			if (headerButtons.length === 0) {
				if (group) group.remove();
				return;
			}

			if (!group) {
				group = document.createElement("div");
				group.addClass("cpm-header-actions-group");
				actionsContainer.prepend(group);
			} else {
				group.empty();
			}

			const container = group;
			headerButtons.forEach((btn) => {
				const btnEl = container.createEl("button", {
					cls: "clickable-icon view-action cpm-header-btn",
				});
				const iconSpan = btnEl.createSpan({ cls: "cpm-svg" });
				setIcon(iconSpan, btn.icon || "terminal");
				if (btn.color) iconSpan.style.color = btn.color;

				if (btn.displayMode === "both" && btn.label) {
					btnEl.createSpan({ cls: "cpm-header-btn-label", text: btn.label });
				}

				setTooltip(btnEl, btn.tooltip || btn.label || btn.commandId);
				btnEl.addEventListener("click", (evt) => {
					evt.stopPropagation();
					this.plugin.registry.executeCommandSafe(btn.commandId);
				});
			});
		});
	}

	populateContextMenu(menu: Menu, locationType: string): void {
		const matching = (this.plugin.settings.pinnedButtons || []).filter(
			(b) => b.location === locationType && this.isDeviceMatch(b.device),
		);
		if (matching.length === 0) return;

		menu.addSeparator();
		matching.forEach((btn) => {
			menu.addItem((item) => {
				item
					.setTitle(btn.label || btn.commandId)
					.setIcon(btn.icon || "terminal")
					.onClick(() => {
						this.plugin.registry.executeCommandSafe(btn.commandId);
					});
			});
		});
	}

	clearInjectedButtons(): void {
		this.ribbonEls.forEach((el) => {
			el.remove();
			const ribbon = (
				this.app.workspace as unknown as {
					leftRibbon?: { items?: { remove?: (el: HTMLElement) => void } };
				}
			).leftRibbon;
			ribbon?.items?.remove?.(el);
		});
		this.ribbonEls = [];

		this.statusBarEls.forEach((el) => el.remove());
		this.statusBarEls = [];

		document.querySelectorAll(".cpm-header-actions-group").forEach((el) => el.remove());
	}
}
