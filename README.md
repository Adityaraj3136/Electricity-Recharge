# SBPDCL Family Recharge

A Progressive Web App (PWA) designed to help you quickly manage and recharge your family's prepaid electricity meters from the official SBPDCL website. 

## Features

- **Store Multiple Consumers**: Save CA Numbers for home, shop, parents, etc. locally on your device.
- **Material Design**: A beautiful, minimal, and responsive user interface built with Tailwind CSS v4.
- **Privacy-First**: No payment details, passwords, or cards are ever requested or stored. All consumer data remains on your device (in localStorage).
- **Automation Ready**: Comes with a generated script to automate filling in the official SBPDCL website to get you to the payment page faster.
- **Backup & Restore**: Easily export and import your saved consumer list.
- **Dark Mode**: fully supported and toggleable.

## Setup & Deployment

This app is built using React + Vite + TypeScript.

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

To deploy this project to **GitHub Pages**, configure your repository settings to serve the static files from the `main` branch or a `gh-pages` branch, depending on your CI/CD setup. The project is already configured with a `vite-plugin-pwa` for immediate use as an installable app.
