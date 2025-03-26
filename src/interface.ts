import net from "node:net";
import tls from "node:tls";

export interface IMAPServerEvents {
  listening: (info: { address: string; port: number; secure: boolean }) => void;
  closed: () => void;
  error: (error: Error) => void;
  'connection:close': (connection: IMAPConnection) => void;
  login: (event: IMAPLoginEvent) => void;
  connection: (event: { id: string; remoteAddress: string; secure: boolean }) => void;
  command: (event: { connection: IMAPConnection, command: string, args: string[] }) => void;
  mailboxSelect: (event: { connection: IMAPConnection, mailbox: string }) => void;
}

export interface IMAPServerConfig {
  host: string;
  port: number;
  welcomeMessage?: string;
  state?: 'not_authenticated' | 'authenticated' | 'selected' | 'logout';
  TLSOptions: {
    enable: boolean;
    key?: string;
    cert?: string;
    ca?: string;
  },
  idleTimeout?: number;
  maxConnections?: number;
}

export interface IMAPConnection {
  id: string;
  socket: net.Socket | tls.TLSSocket;
  state: 'not_authenticated' | 'authenticated' | 'selected' | 'logout';
  user?: string;
  selectedMailbox?: string;
  secure: boolean;
}

export interface IMAPLoginEvent {
  connection: IMAPConnection;
  username: string;
  password: string;
  success: boolean;
  auth: (success: boolean) => void;
}
