"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnvFile = loadEnvFile;
const fs_1 = __importDefault(require("fs"));
/**
 * Minimal environment loader that mirrors dotenv-style parsing so we can
 * support local development without introducing an additional dependency.
 */
function loadEnvFile(envPath) {
    if (!envPath || !fs_1.default.existsSync(envPath)) {
        return;
    }
    const envContent = fs_1.default.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            return;
        }
        const [key, ...rest] = trimmed.split('=');
        if (!key) {
            return;
        }
        const value = rest.join('=').trim();
        if (!(key in process.env)) {
            process.env[key] = value;
        }
    });
}
