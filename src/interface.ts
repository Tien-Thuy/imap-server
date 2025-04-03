import net from "node:net";
import tls from "node:tls";

export interface IMAPServerEvents {
  connect: (event: {
    id: string;
    remoteAddress: string;
    secure: boolean
  }) => void;
  close: () => void;
  LOGIN: (event: {
    connection: IMAPConnection;
    username: string;
    password: string;
    auth: (success: boolean) => void;
  }, tag: string) => void;
  LOGOUT: (event: IMAPConnection, tag: string) => void;
  SELECT: (connection: IMAPConnection, callback: (exits: boolean, flags: string[]) => void, tag: string) => void;
  data: (event: {
    connection: IMAPConnection;
    data: Buffer;
  }) => void;
  timeout: (event: IMAPConnection) => void;
  listening: (info: {
    address: string;
    port: number;
    secure: boolean
  }) => void;
  error: (error: Error) => void;
  CAPABILITY: (connection: IMAPConnection, tag: string) => void;
  LIST: (connection: IMAPConnection, callback: (mailboxes: {
    name: string;
    child: boolean;
  }[]) => void, tag: string) => void;
  'connection:close': (connection: IMAPConnection) => void;
  command: (event: { connection: IMAPConnection, command: string, args: string[] }) => void;
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
  idLength?: number;
  storage?: IStorage;
}

export interface IStorage {
  get: (key: string) => Promise<IConnectInfo | undefined>;
  set: (key: string, value: IConnectInfo) => Promise<void>;
  destroy: (key: string) => Promise<void>;
  list: () => Promise<Map<string, IConnectInfo>>;
}

export interface IConnectInfo {
  state: 'not_authenticated' | 'authenticated' | 'selected' | 'logout';
  user?: string;
  selectedMailbox?: string;
  secure: boolean;
}

export interface IMAPConnection {
  id: string;
  socket: net.Socket | tls.TLSSocket;
}
