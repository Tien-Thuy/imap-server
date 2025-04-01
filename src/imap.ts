import {EventEmitter} from 'events';
import * as net from "node:net";
import * as tls from "node:tls";
import * as randomString from "randomstring";
import {Buffer} from 'node:buffer';
import {IMAPConnection, IMAPServerConfig, IMAPServerEvents} from "./interface";

export default class IMAPServer extends EventEmitter {
  private readonly config: IMAPServerConfig;
  private connections: Map<string, IMAPConnection>;
  private running: boolean;
  private server?: net.Server | tls.Server;

  public on<E extends keyof IMAPServerEvents>(event: E, listener: IMAPServerEvents[E]): this {
    return super.on(event, listener as any);
  }

  public once<E extends keyof IMAPServerEvents>(event: E, listener: IMAPServerEvents[E]): this {
    return super.once(event, listener as any);
  }

  public emit<E extends keyof IMAPServerEvents>(event: E, ...args: Parameters<IMAPServerEvents[E]>): boolean {
    return super.emit(event, ...args);
  }

  constructor(config: IMAPServerConfig) {
    super();
    this.config = {
      ...{
        welcomeMessage: 'Welcome to Tien Thuy IMAP Server',
        TLSOptions: {
          enable: false
        },
        idleTimeout: 180000,
        maxConnections: 0,
        idLength: 22
      },
      ...config
    };
    this.connections = new Map();
    this.running = false;
  }

  public async start() {
    console.info(`Starting IMAP server at ${this.config.port}...`);
    if (this.running) {
      throw new Error('IMAP server is started.');
    }
    if (!this.config.TLSOptions.enable) {
      this.server = net.createServer({
        allowHalfOpen: false,
        pauseOnConnect: false
      });
    } else {
      if (!this.config.TLSOptions.key || !this.config.TLSOptions.cert) {
        throw new Error('TLS key and cert are required.');
      }

      this.server = tls.createServer(this.config.TLSOptions);
    }

    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleError.bind(this));
    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        this.running = true;
        this.emit('listening', {
          address: this.config.host,
          port: this.config.port,
          secure: this.config.TLSOptions.enable
        });
        resolve();
      });
    });
    console.log(`IMAP is started at ${this.config.host}:${this.config.port} (${this.config.TLSOptions.enable ? 'secure' : 'standard'})`);
  }

  public async stop() {
    if (!this.running || !this.server) {
      throw new Error('IMAP server is not started.');
    }

    Array.from(this.connections.values()).forEach(connection => {
      this.closeConnection(connection);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.running = false;
          this.emit('close');
          resolve();
        }
      });
    });
  }

  public closeConnection(connection: IMAPConnection, reason: string = 'Server shutdown') {
    try {
      if (!connection.socket.destroyed) {
        connection.socket.end();
      }
    } catch (error) {
      console.error(`Error closing connection ${connection.id}:`, error);
    } finally {
      this.connections.delete(connection.id);
    }
  }

  private handleConnection(socket: net.Socket | tls.TLSSocket): void {
    if (this.config.maxConnections !== 0 && this.connections.size >= this.config.maxConnections) {
      socket.end('* NO Too many connections\r\n');
      socket.destroy();
      return;
    }

    const connectionId: string = randomString.generate(this.config.idLength);
    const connection: IMAPConnection = {
      id: connectionId,
      socket,
      state: 'not_authenticated',
      secure: this.config.TLSOptions.enable || socket instanceof tls.TLSSocket,
      mailbox: []
    };
    this.connections.set(connectionId, connection);
    socket.on('close', () => this.handleOnClose(connection));
    socket.on('timeout', () => this.handleOnTimeout(connection));
    socket.on('error', (error) => this.handleOnError(connection, error));
    socket.on('data', (data) => this.handleOnData(connection, data))
    if (this.config.idleTimeout !== 0) {
      socket.setTimeout(this.config.idleTimeout);
    }

    this.sendCommand(connection, `* OK ${this.config.welcomeMessage}`);
    this.emit('connect', {
      id: connectionId,
      remoteAddress: socket.remoteAddress,
      secure: connection.secure
    });
  }

  private handleError(error: Error): void {
    console.error('Server error:', error);
    this.emit('error', error);
  }

  private handleOnClose(connection: IMAPConnection) {
    this.emit('close')
  }

  private handleOnTimeout(connection: IMAPConnection) {
    this.emit('timeout', connection);
  }

  private handleOnError(connection: IMAPConnection, error: any) {
    this.emit('error', error);
  }

  private handleOnData(connection: IMAPConnection, data: Buffer): void {
    this.emit('data', {
      connection,
      data
    });
    const commands: string[] = data.toString('utf8').trim().split(' ');
    if (commands.length < 2) {
      console.log(commands);
      this.sendCommand(connection, '* BAD Malformed command');
      return;
    }
    const tag: string = commands[0];
    const command: string = commands[1].toUpperCase();
    const args: string[] = commands.slice(2);

    switch (command) {
      case 'CAPABILITY':
        this.commandCapability(connection, tag);
        break;
      case 'LOGIN':
        this.commandLogin(connection, tag, args);
        break;
      case 'LOGOUT':
        this.commandLogout(connection, tag);
        break;
      case 'SELECT':
        this.commandSelect(connection, tag, args);
        break;
      case 'LIST':
        this.commandList(connection, tag, args);
        break;
      case 'NOOP':
        this.sendCommand(connection, `${tag} OK NOOP completed`);
        break;
      case 'STARTTLS':
        this.commandStartTLS(connection, tag);
        break;
      default:
        this.sendCommand(connection, `${tag} BAD Command not recognized or not implemented`);
        break;
    }
  }

  private sendCommand(connection: IMAPConnection, response: string): void {
    try {
      if (connection.socket.writable) {
        connection.socket.write(response + '\r\n');
        console.log(`[${connection.id}] S: ${response}`);
      }
    } catch (error) {
      console.error(`Error sending response to ${connection.id}:`, error);
      this.closeConnection(connection, 'Failed to send response');
    }
  }

  private commandCapability(connection: IMAPConnection, tag: string): void {
    const capabilities = [
      'IMAP4rev1',
      'IMAP4',
      'AUTH=PLAIN',
      'AUTH=LOGIN'
    ];
    if (!connection.secure) {
      capabilities.push('STARTTLS');
    }

    this.emit('CAPABILITY', connection, tag);
    this.sendCommand(connection, `* CAPABILITY ${capabilities.join(' ')}`);
    this.sendCommand(connection, `${tag} OK CAPABILITY completed`);
  }

  private commandLogin(connection: IMAPConnection, tag: string, args: string[]): void {
    if (connection.state !== 'not_authenticated') {
      this.sendCommand(connection, `${tag} BAD Command not valid in current state`);
      return;
    }
    if (args.length < 2) {
      this.sendCommand(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    const username: string = args[0].replace(/"/g, '');
    this.emit('LOGIN', {
      connection,
      username: username,
      password: args[1].replace(/"/g, ''),
      auth: (success: boolean) => {
        if (success) {
          connection.state = 'authenticated';
          connection.user = username;
          this.sendCommand(connection, `${tag} OK LOGIN completed`);
        } else {
          this.sendCommand(connection, `${tag} NO LOGIN failed`);
        }
      }
    }, tag);
    if (!this.listenerCount('login')) {
      this.sendCommand(connection, `${tag} NO LOGIN failed`);
    }
  }

  private commandLogout(connection: IMAPConnection, tag: string): void {
    this.sendCommand(connection, '* BYE IMAP server logging out');
    this.sendCommand(connection, `${tag} OK LOGOUT completed`);
    this.emit('LOGOUT', connection, tag);
    connection.state = 'logout';
    this.closeConnection(connection, 'Client logout');
  }

  private commandSelect(connection: IMAPConnection, tag: string, args: string[]): void {
    if (connection.state !== 'authenticated' && connection.state !== 'selected') {
      this.sendCommand(connection, `${tag} BAD Command not valid in current state`);
      return;
    }
    if (args.length < 1) {
      this.sendCommand(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    const mailboxName = args[0].replace(/"/g, '');
    connection.state = 'selected';
    connection.selectedMailbox = mailboxName;
    this.emit('SELECT', connection, (exits: boolean, flags: string[]) => {
      if (exits) {
        const mailbox: string = flags.map((flag) => `\\${flag}`).join(' ')
        this.sendCommand(connection, `* 0 EXISTS`);
        this.sendCommand(connection, `* 0 RECENT`);
        this.sendCommand(connection, `* OK [UNSEEN 0] No unseen messages`);
        this.sendCommand(connection, `* OK [UIDVALIDITY 1] UIDs valid`);
        this.sendCommand(connection, `* OK [UIDNEXT 1] Predicted next UID`);
        this.sendCommand(connection, `* FLAGS (${mailbox})`);
        this.sendCommand(connection, `* OK [PERMANENTFLAGS (${mailbox}})] Permanent flags`);
        this.sendCommand(connection, `${tag} OK [READ-WRITE] SELECT completed`);
      } else {
        this.sendCommand(connection, `${tag} NO Mailbox doesn't exist (Failure)`);
      }
    }, tag)
  }

  /**
   * Xử lý lệnh LIST
   */
  private commandList(connection: IMAPConnection, tag: string, args: string[]): void {
    if (connection.state !== 'authenticated' && connection.state !== 'selected') {
      this.sendCommand(connection, `${tag} BAD Command not valid in current state`);
      return;
    }
    if (args.length < 2) {
      this.sendCommand(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    this.emit('LIST', connection, (mailboxes) => {
      for (const mailbox of mailboxes) {
        this.sendCommand(connection, `* LIST (\\${mailbox.child ? 'HasChildren' : 'NoChildren'}) "." "${mailbox.name}"`);
      }
      this.sendCommand(connection, `${tag} OK LIST completed`);
    }, tag)
  }

  /**
   * Xử lý lệnh STARTTLS
   */
  private commandStartTLS(connection: IMAPConnection, tag: string): void {
    // Kiểm tra nếu đã là kết nối bảo mật
    if (connection.secure) {
      this.sendCommand(connection, `${tag} BAD Connection already secure`);
      return;
    }
    if (!this.config.TLSOptions.enable || !this.config.TLSOptions.key || !this.config.TLSOptions.cert) {
      this.sendCommand(connection, `${tag} NO STARTTLS not available`);
      return;
    }

    this.sendCommand(connection, `${tag} OK Begin TLS negotiation now`);
    const socket = connection.socket as net.Socket;
    const secureContext = tls.createSecureContext(this.config.TLSOptions);
    const connectionId = connection.id;
    const state = connection.state;
    const user = connection.user;
    try {
      const secureSocket = new tls.TLSSocket(socket, {
        secureContext,
        isServer: true,
        rejectUnauthorized: false
      });
      this.connections.delete(connectionId);
      const secureConnection: IMAPConnection = {
        id: connectionId,
        socket: secureSocket,
        state,
        user,
        secure: true,
        mailbox: []
      };
      this.connections.set(connectionId, secureConnection);
      secureSocket.on('close', () => this.handleOnClose(connection));
      secureSocket.on('timeout', () => this.handleOnTimeout(connection));
      secureSocket.on('error', (error) => this.handleOnError(connection, error));
      secureSocket.on('data', (data) => this.handleOnData(connection, data))
    } catch (error) {
      console.error('Lỗi nâng cấp kết nối TLS:', error);
      this.closeConnection(connection, 'TLS upgrade failed');
    }
  }
}
