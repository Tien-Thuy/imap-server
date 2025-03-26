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
          this.emit('closed');
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

    const connectionId: string = randomString.generate(22);
    const connection: IMAPConnection = {
      id: connectionId,
      socket,
      state: 'not_authenticated',
      secure: this.config.TLSOptions.enable || socket instanceof tls.TLSSocket
    };
    this.connections.set(connectionId, connection);
    socket.on('close', () => this.handleOnClose(connection));
    socket.on('timeout', () => this.handleOnTimeout(connection));
    socket.on('error', (error) => this.handleOnError(connection, error));
    socket.on('data', (data) => this.handleOnData(connection, data))
    if (this.config.idleTimeout !== 0) {
      socket.setTimeout(this.config.idleTimeout);
    }

    this.commandNoop(connection, `* OK ${this.config.welcomeMessage}`);
    this.emit('connection', {
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

  }

  private handleOnTimeout(connection: IMAPConnection) {

  }

  private handleOnError(connection: IMAPConnection, error: any) {

  }

  private handleOnData(connection: IMAPConnection, data: Buffer): void {
    const commands: string[] = data.toString('utf8').trim().split(' ');
    if (commands.length < 2) {
      console.log(commands);
      this.commandNoop(connection, '* BAD Malformed command');
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
        this.commandNoop(connection, `${tag} OK NOOP completed`);
        break;
      case 'STARTTLS':
        this.commandStartTLS(connection, tag);
        break;
      default:
        this.commandNoop(connection, `${tag} BAD Command not recognized or not implemented`);
        break;
    }
  }

  private commandNoop(connection: IMAPConnection, response: string): void {
    try {
      if (connection.socket.writable) {
        connection.socket.write(response + '\r\n');
        // Log phản hồi (cần lọc thông tin nhạy cảm trước khi log)
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
    if (!connection.secure) {    // Thêm STARTTLS nếu server không bảo mật
      capabilities.push('STARTTLS');
    }

    this.commandNoop(connection, `* CAPABILITY ${capabilities.join(' ')}`);
    this.commandNoop(connection, `${tag} OK CAPABILITY completed`);
  }

  /**
   * Xử lý lệnh LOGIN
   */
  private commandLogin(connection: IMAPConnection, tag: string, args: string[]): void {
    if (connection.state !== 'not_authenticated') {
      this.commandNoop(connection, `${tag} BAD Command not valid in current state`);
      return;
    }
    if (args.length < 2) {
      this.commandNoop(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    const username = args[0].replace(/"/g, '');
    this.emit('login', {
      connection,
      username: username,
      password: args[1].replace(/"/g, ''),
      success: false,
      auth: (success: boolean) => {
        if (success) {
          connection.state = 'authenticated';
          connection.user = username;
          this.commandNoop(connection, `${tag} OK LOGIN completed`);
        } else {
          this.commandNoop(connection, `${tag} NO LOGIN failed`);
        }
      }
    });
    if (!this.listenerCount('login')) {
      this.commandNoop(connection, `${tag} NO LOGIN failed`);
    }

  }

  private commandLogout(connection: IMAPConnection, tag: string): void {
    this.commandNoop(connection, '* BYE IMAP server logging out');
    this.commandNoop(connection, `${tag} OK LOGOUT completed`);
// TODO: Callback to auth
    connection.state = 'logout';
    this.closeConnection(connection, 'Client logout');
  }

  private commandSelect(connection: IMAPConnection, tag: string, args: string[]): void {
    // Kiểm tra trạng thái kết nối
    if (connection.state !== 'authenticated' && connection.state !== 'selected') {
      this.commandNoop(connection, `${tag} BAD Command not valid in current state`);
      return;
    }

    // Kiểm tra tham số
    if (args.length < 1) {
      this.commandNoop(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    const mailboxName = args[0].replace(/"/g, '');

    // Ở đây bạn sẽ thêm logic để chọn hộp thư
    // Ví dụ này giả định thành công
    connection.state = 'selected';
    connection.selectedMailbox = mailboxName;

    // Gửi trạng thái hộp thư
    this.commandNoop(connection, `* 0 EXISTS`);
    this.commandNoop(connection, `* 0 RECENT`);
    this.commandNoop(connection, `* OK [UNSEEN 0] No unseen messages`);
    this.commandNoop(connection, `* OK [UIDVALIDITY 1] UIDs valid`);
    this.commandNoop(connection, `* OK [UIDNEXT 1] Predicted next UID`);
    this.commandNoop(connection, `* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)`);
    this.commandNoop(connection, `* OK [PERMANENTFLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)] Permanent flags`);
    this.commandNoop(connection, `${tag} OK [READ-WRITE] SELECT completed`);
  }

  /**
   * Xử lý lệnh LIST
   */
  private commandList(connection: IMAPConnection, tag: string, args: string[]): void {
    // Kiểm tra trạng thái kết nối
    if (connection.state !== 'authenticated' && connection.state !== 'selected') {
      this.commandNoop(connection, `${tag} BAD Command not valid in current state`);
      return;
    }
    // Kiểm tra tham số
    if (args.length < 2) {
      this.commandNoop(connection, `${tag} BAD Missing required arguments`);
      return;
    }

    // TODO: callback to show list mailbox
    this.commandNoop(connection, '* LIST (\\HasNoChildren) "." "INBOX"');
    this.commandNoop(connection, '* LIST (\\HasNoChildren) "." "Sent"');
    this.commandNoop(connection, '* LIST (\\HasNoChildren) "." "Drafts"');
    this.commandNoop(connection, '* LIST (\\HasNoChildren) "." "Trash"');
    this.commandNoop(connection, '* LIST (\\HasNoChildren) "." "Junk"');
    this.commandNoop(connection, `${tag} OK LIST completed`);
  }

  /**
   * Xử lý lệnh STARTTLS
   */
  private commandStartTLS(connection: IMAPConnection, tag: string): void {
    // Kiểm tra nếu đã là kết nối bảo mật
    if (connection.secure) {
      this.commandNoop(connection, `${tag} BAD Connection already secure`);
      return;
    }

    // Kiểm tra nếu không có cấu hình TLS
    if (!this.config.TLSOptions.enable || !this.config.TLSOptions.key || !this.config.TLSOptions.cert) {
      this.commandNoop(connection, `${tag} NO STARTTLS not available`);
      return;
    }

    this.commandNoop(connection, `${tag} OK Begin TLS negotiation now`);

    // Nâng cấp kết nối lên TLS
    const socket = connection.socket as net.Socket;
    const secureContext = tls.createSecureContext(this.config.TLSOptions);

    // Lưu socket ID và state trước khi nâng cấp
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
        secure: true
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
