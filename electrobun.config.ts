import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "app-img-installer",
		identifier: "dev.appimginstaller.gui",
		version: "0.1.0",
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/gui/bun/index.ts",
		},
		views: {
			mainview: {
				entrypoint: "src/gui/mainview/index.ts",
			},
		},
		copy: {
			"src/gui/mainview/index.html": "views/mainview/index.html",
			"src/gui/mainview/index.css": "views/mainview/index.css",
		},
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
