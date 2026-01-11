const { exec } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const execAsync = promisify(exec);
const crypto = require('crypto');
const https = require('https');

// 设置全局环境变量
//process.env.PORT = '3000';  // 直接设置为 7860   项目接口
//process.env.port = process.env.PORT;  // 确保小写的 port 也使用相同值
process.env.port = process.env.PORT || '8501';
process.env.TUNNEL_METRICS = process.env.TUNNEL_METRICS || '127.0.0.1:';
process.env.WEBAPPDUANKOU = process.env.WEBAPPDUANKOU || process.env.PORT || process.env.port;  // 使用相同的端口 
process.env.CHARUI_KAIGUAN = process.env.CHARUI_KAIGUAN || '1';
process.env.ERGOU_KAIGUAN = process.env.ERGOU_KAIGUAN || '1';              //如果为0 下面的为空, 则自动启用单核心内部转发,前端依然保持. 
process.env.ERGOUYAOSHI = process.env.ERGOUYAOSHI || 'eyJhIjoiYmE0ZTVmNTFkYTIxZDVkNjMyZDQ0NjMyNmJjZDRjMTkiLCJ0IjoiZTFjMDVlYmEtMDNiOS00ZmZmLWJhMmYtNWFmNmY1MzcwNzNmIiwicyI6Ik9XRmpNR1F6WVRBdE5tWTJOQzAwTWpNMkxXRTJZamN0T1dNMk5XRmpPR1psTldNdyJ9';
process.env.LUJING = process.env.LUJING || 'arsssgo';                         //默认arsssgo可改,如果使用xh模式,必须把此处改为固定的sxhtp
process.env.WOSHOUMIMA = process.env.WOSHOUMIMA || '639c55b0-77de-4701-bacc-668576ef20d3';
process.env.DUANKOU = process.env.DUANKOU || '23781';             //有2狗就是2狗通道接口, 没有就是32500+随意内转端口
process.env.YONGDU = process.env.YONGDU || '0';
process.env.HUILUOFANGSHI = process.env.HUILUOFANGSHI || '0';     //回落方式 参数1套接字此模式只读系统无法用,bsd有残留,   参数0  稳定且均为随机数         sb不生效
process.env.CHARUIMOSHI = process.env.CHARUIMOSHI || 'vm';        //xay模式vm对应vm+vl+tro3协议  xh对应xhttp       sb不生效
process.env.PROXY_MODE = process.env.PROXY_MODE || 'xray';  // 可选值: 'xray' 或 'singbox'

// 在文件开头添加网页内容配置
const WEB_CONFIG = {
    title: "Welcome to Server Panel",
    contentType: "text/html",
    responseCode: 200,
    content: `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Server Panel</title>
<style>
    body {
        font-family: Arial, Helvetica, sans-serif;
        background: linear-gradient(135deg, #3f87a6, #ebf8e1, #f69d3c);
        height: 100vh;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #333;
        text-align: center;
    }
    .container {
        background: rgba(255, 255, 255, 0.9);
        border-radius: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        padding: 40px 60px;
        max-width: 500px;
        width: 90%;
        transition: transform 0.2s ease;
    }
    .container:hover {
        transform: scale(1.02);
    }
    h1 {
        font-size: 2em;
        color: #2c3e50;
        margin-bottom: 10px;
    }
    p {
        font-size: 1.1em;
        color: #555;
        margin-top: 0;
    }
    footer {
        margin-top: 20px;
        font-size: 0.9em;
        color: #888;
    }
</style>
</head>
<body>
    <div class="container">
        <h1>Welcome to Your Server!</h1>
        <p>This page is running on your Node.js server.</p>
        <footer>© 2025 SogaDev Hosting</footer>
    </div>
</body>
</html>
`
};

// 检查目录是否可读写
function isDirectoryWritable(dir) {
    try {
        const testFile = path.join(dir, `.test_${Date.now()}`);
        fs.writeFileSync(testFile, '');
        fs.unlinkSync(testFile);
        return true;
    } catch {
        return false;
    }
}

// 查找可写目录
function findWritableDirectory() {
    // 优先检查当前目录和临时目录
    const primaryDirs = [
        process.cwd(),      // 优先使用当前目录
        os.tmpdir()         // 其次是系统临时目录
    ];

    // 先尝试主要目录
    for (const dir of primaryDirs) {
        try {
            if (dir && fs.existsSync(dir) && isDirectoryWritable(dir)) {
                console.log(`Using directory: ${dir}`);
                return dir;
            }
        } catch {
            continue;
        }
    }

    // 如果主要目录都不可用，尝试其他备选目录
    const fallbackDirs = [
        '/tmp',                          // Linux/Unix 临时目录
        os.homedir(),                    // 用户主目录
        path.join(os.homedir(), 'tmp'),  // 用户主目录下的 tmp
        '/var/tmp',                      // 另一个常用临时目录
        '/dev/shm'                       // 内存文件系统（如果可用）
    ];

    // Windows 特定目录
    if (process.platform === 'win32') {
        const winDirs = [
            process.env.TEMP,
            process.env.TMP,
            'C:\\Windows\\Temp'
        ].filter(Boolean);
        fallbackDirs.push(...winDirs);
    }

    // 尝试备选目录
    for (const dir of fallbackDirs) {
        try {
            if (dir && fs.existsSync(dir) && isDirectoryWritable(dir)) {
                console.log(`Using fallback directory: ${dir}`);
                return dir;
            }
        } catch {
            continue;
        }
    }

    throw new Error('No writable directory found in the system');
}

// 工作目录检查和设置
let workDir;
try {
    workDir = findWritableDirectory();
} catch (err) {
    console.error('Fatal error: Cannot find writable directory:', err);
    process.exit(1);
}

// 生成随机字符串
function generateRandomString(min, max) {
    const length = min + Math.floor(Math.random() * (max - min + 1));
    return Array(length)
        .fill('abcdefghijklmnopqrstuvwxyz')
        .map(x => x[Math.floor(Math.random() * x.length)])
        .join('');
}

// 生成随机端口
function generateRandomPort() {
    return 8500 + Math.floor(Math.random() * 1000);
}

// 为了方便在JS中使用，创建本地常量引用
const WEBAPPDUANKOU = process.env.WEBAPPDUANKOU;
const CHARUI_KAIGUAN = process.env.CHARUI_KAIGUAN;
const ERGOU_KAIGUAN = process.env.ERGOU_KAIGUAN;
const ERGOUYAOSHI = process.env.ERGOUYAOSHI;
const LUJING = process.env.LUJING;
const WOSHOUMIMA = process.env.WOSHOUMIMA;
const DUANKOU = process.env.DUANKOU;
const YONGDU = process.env.YONGDU;

// 脚本配置
process.env.SCRIPT_SWITCH = process.env.SCRIPT_SWITCH || '0';          // 0: dcsrcxbsnoagronoxhtp2.sh使用双noxr和arog, 1: dcsrcxbsagro.sh单noago和sb    切换x和sb
const SCRIPT_SWITCH = process.env.SCRIPT_SWITCH;
const scriptFileName = SCRIPT_SWITCH === '1' ? 'dcsrcxbsagro.sh' : 'dcsrcxbsnoagronoxhtp2.sh';            // 暂时只能使用1
const scriptURL = `https://github.com/bignixfly/for_play_game_s/releases/download/adss/${scriptFileName}`;

// 检查命令是否可用
async function isCommandAvailable(command) {
    try {
        await execAsync(`which ${command}`);
        return true;
    } catch {
        return false;
    }
}

// 使用 HTTPS 下载
function downloadWithHttps(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        
        function doDownload(url) {
            https.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    doDownload(response.headers.location);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    fs.chmod(filePath, 0o755, (err) => {
                        if (err) reject(err);
                        else resolve(true);
                    });
                });

            }).on('error', (err) => {
                fs.unlink(filePath, () => {});
                reject(err);
            });
        }

        doDownload(url);

        file.on('error', (err) => {
            fs.unlink(filePath, () => {});
            reject(err);
        });
    });
}

// 组合下载方法
async function downloadFile(url, filename) {
    const filePath = path.join(workDir, filename);
    
    // 尝试使用 curl
    if (await isCommandAvailable('curl')) {
        for (let i = 0; i < 10; i++) {
            try {
                await execAsync(`curl -sSL "${url}" -o "${filePath}"`);
                await fs.promises.chmod(filePath, 0o755);
                return filePath;
            } catch (err) {
                console.log('Curl download attempt failed:', i + 1);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // 尝试使用 wget
    if (await isCommandAvailable('wget')) {
        for (let i = 0; i < 10; i++) {
            try {
                await execAsync(`wget -q "${url}" -O "${filePath}"`);
                await fs.promises.chmod(filePath, 0o755);
                return filePath;
            } catch (err) {
                console.log('Wget download attempt failed:', i + 1);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // 尝试使用 HTTPS
    for (let i = 0; i < 10; i++) {
        try {
            await downloadWithHttps(url, filePath);
            return filePath;
        } catch (err) {
            console.log('HTTPS download attempt failed:', i + 1);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // 最后尝试使用 fetch
    for (let i = 0; i < 10; i++) {
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(url);
            const fileStream = fs.createWriteStream(filePath);
            await new Promise((resolve, reject) => {
                response.body.pipe(fileStream);
                response.body.on('error', reject);
                fileStream.on('finish', resolve);
            });
            await fs.promises.chmod(filePath, 0o755);
            return filePath;
        } catch (err) {
            console.log('Fetch download attempt failed:', i + 1);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    throw new Error('All download methods failed after maximum attempts');
}

// 生成配置文件
function generateConfig(type) {
    let config;
    const randomPorts = Array(3).fill(0).map(() => generateRandomPort());
    const randomStrings = Array(3).fill(0).map(() => '@' + generateRandomString(5, 10));
    const configFileName = process.env.PROXY_MODE === 'singbox' ? 'syaph.json' : 'phpcontent.json';

    if (process.env.PROXY_MODE === 'singbox') {
        config = {
            log: {
                disabled: false,  // 启用日志以便调试
                level: "info",
                timestamp: true
            },
            dns: {
                servers: [
                    {
                        tag: "local",
                        address: "223.5.5.5",  // 使用更快的 DNS
                        detour: "direct"
                    }
                ],
                rules: [],
                final: "local",
                strategy: "prefer_ipv4",
                disable_cache: false,
                disable_expire: false
            },
            inbounds: [
                {
                    type: "vmess",
                    tag: "vmess-ws-in",
                    listen: "::",
                    listen_port: parseInt(process.env.DUANKOU),
                    users: [
                        {
                            uuid: process.env.WOSHOUMIMA,
                            alterId: 0  // 添加 alterId
                        }
                    ],
                    transport: {
                        type: "ws",
                        path: `/${process.env.LUJING}-vmws`,
                        headers: {  // 添加 headers
                            Host: "localhost"
                        },
                        early_data_header_name: "Sec-WebSocket-Protocol"
                    }
                }
            ],
            outbounds: [
                {
                    type: "direct",
                    tag: "direct"
                }
            ],
            route: {
                rules: [
                    {
                        protocol: ["dns"],
                        outbound: "direct"
                    },
                    {
                        ip_is_private: true,
                        outbound: "direct"
                    }
                ],
                final: "direct"
            }
        };
    } else if (type === 'vm' || type === 'xh') {
        // xray 配置
        if (type === 'vm') {
            // vm 模式配置，根据 HUILUOFANGSHI 设置
            const listenConfigs = process.env.HUILUOFANGSHI === '1'
                ? randomStrings.map(str => ({ listen: str.substring(1) }))  // 移除 @ 并使用套接字
                : randomPorts.map(port => ({ port, listen: "127.0.0.1" })); // 使用端口

            config = {
                log: {
                    access: "/dev/null",
                    error: "/dev/null",
                    loglevel: "none"
                },
                routing: {
                    domainStrategy: "AsIs",
                    rules: [
                        {
                            type: "field",
                            protocol: ["dns"],
                            outboundTag: "dns-out"
                        }
                    ]
                },
                inbounds: [
                    {
                        tag: "Vless-TCP-XTLS",
                        port: parseInt(process.env.DUANKOU),
                        protocol: "vless",
                        settings: {
                            clients: [
                                {
                                    id: process.env.WOSHOUMIMA,
                                    flow: "xtls-rprx-vision",
                                    level: 0
                                }
                            ],
                            decryption: "none",
                            fallbacks: [
                                {
                                    path: `/${process.env.LUJING}-vlws`,
                                    dest: listenConfigs[0].port,
                                    xver: 2
                                },
                                {
                                    path: `/${process.env.LUJING}-vmws`,
                                    dest: listenConfigs[1].port,
                                    xver: 2
                                },
                                {
                                    path: `/${process.env.LUJING}-trojanws`,
                                    dest: listenConfigs[2].port,
                                    xver: 2
                                }
                            ]
                        },
                        streamSettings: {
                            network: "tcp"
                        }
                    },
                    {
                        ...listenConfigs[0],
                        protocol: "vless",
                        settings: {
                            clients: [
                                {
                                    id: process.env.WOSHOUMIMA,
                                    level: 0
                                }
                            ],
                            decryption: "none"
                        },
                        streamSettings: {
                            network: "ws",
                            security: "none",
                            wsSettings: {
                                acceptProxyProtocol: true,
                                path: `/${process.env.LUJING}-vlws`
                            }
                        },
                        sniffing: {
                            enabled: true,
                            destOverride: [
                                "http",
                                "tls",
                                "quic"
                            ]
                        }
                    },
                    {
                        ...listenConfigs[1],
                        protocol: "vmess",
                        settings: {
                            clients: [
                                {
                                    id: process.env.WOSHOUMIMA,
                                    level: 0
                                }
                            ]
                        },
                        streamSettings: {
                            network: "ws",
                            security: "none",
                            wsSettings: {
                                acceptProxyProtocol: true,
                                path: `/${process.env.LUJING}-vmws`
                            }
                        },
                        sniffing: {
                            enabled: true,
                            destOverride: [
                                "http",
                                "tls",
                                "quic"
                            ]
                        }
                    },
                    {
                        ...listenConfigs[2],
                        protocol: "trojan",
                        settings: {
                            clients: [
                                {
                                    password: process.env.WOSHOUMIMA,
                                    level: 0
                                }
                            ]
                        },
                        streamSettings: {
                            network: "ws",
                            security: "none",
                            wsSettings: {
                                acceptProxyProtocol: true,
                                path: `/${process.env.LUJING}-trojanws`
                            }
                        },
                        sniffing: {
                            enabled: true,
                            destOverride: [
                                "http",
                                "tls",
                                "quic"
                            ]
                        }
                    }
                ],
                outbounds: [
                    {
                        protocol: "freedom",
                        tag: "direct"
                    },
                    {
                        protocol: "blackhole",
                        tag: "block"
                    },
                    {
                        tag: "dns-out",
                        protocol: "dns"
                    }
                ],
                dns: {
                    servers: [
                        "8.8.8.8",
                        "1.1.1.1"
                    ]
                }
            };
        } else {
            // xh 模式配置
            config = {
                log: {
                    access: "/dev/null",
                    error: "/dev/null",
                    loglevel: "none"
                },
                inbounds: [
                    {
                        port: parseInt(process.env.DUANKOU),
                        protocol: "vless",
                        tag: "vless-xhttp-in",
                        listen: "::",
                        settings: {
                            decryption: "none",
                            clients: [
                                {
                                    id: process.env.WOSHOUMIMA
                                }
                            ]
                        },
                        streamSettings: {
                            network: "xhttp",
                            xhttpSettings: {
                                mode: "auto",
                                path: "/sxhtp",
                                method: "PUT",
                                headers: {
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                    "Accept-Language": "en-US,en;q=0.9",
                                    "Accept-Encoding": "gzip, deflate, br",
                                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                                    "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
                                    "sec-ch-ua-mobile": "?0",
                                    "sec-ch-ua-platform": "\"Windows\"",
                                    "sec-fetch-dest": "document",
                                    "sec-fetch-mode": "navigate",
                                    "sec-fetch-site": "none",
                                    "sec-fetch-user": "?1",
                                    "Connection": "keep-alive",
                                    "Upgrade-Insecure-Requests": "1"
                                }
                            }
                        }
                    }
                ],
                outbounds: [
                    {
                        tag: "direct",
                        protocol: "freedom",
                        settings: {}
                    },
                    {
                        tag: "blocked",
                        protocol: "blackhole",
                        settings: {}
                    },
                    {
                        tag: "dns-out",
                        protocol: "dns"
                    }
                ],
                dns: {
                    servers: [
                        "8.8.8.8",
                        "1.1.1.1"
                    ]
                },
                routing: {
                    domainStrategy: "AsIs",
                    rules: [
                        {
                            type: "field",
                            protocol: ["dns"],
                            outboundTag: "dns-out"
                        }
                    ]
                }
            };
        }
    }

    const configPath = path.join(workDir, configFileName);
    const configContent = JSON.stringify(config, null, 2);
    
    // 确保写入权限
    fs.writeFileSync(configPath, configContent, { mode: 0o644 });

    return configPath;  // 移除所有配置信息的打印
}

// 创建HTTP服务器并处理请求
function createServer() {
    const server = http.createServer();

    server.on('connection', (socket) => {
        let buffer = Buffer.alloc(0);
        let connectionHandled = false;

        socket.on('data', (chunk) => {
            if (connectionHandled) return;

            buffer = Buffer.concat([buffer, chunk]);
            const data = buffer.toString();

            if (!connectionHandled && 
                (data.includes('\r\n\r\n') || data.includes('\n\n') || buffer.length > 2048)) {
                
                connectionHandled = true;
                
                const firstLine = data.split('\n')[0];
                const isHttpRequest = firstLine.includes('HTTP/1.1') || firstLine.includes('HTTP/1.0');
                const isXrayRequest = firstLine.includes(`/${LUJING}`);
                
                // 修改转发逻辑：xh 模式或 xray 请求时直接转发
                if (isXrayRequest || process.env.CHARUIMOSHI === 'xh') {
                    const clientSocket = net.connect({
                        port: parseInt(DUANKOU),
                        host: 'localhost'
                    }, () => {
                        clientSocket.write(buffer);
                        buffer = Buffer.alloc(0);
                        socket.pipe(clientSocket);
                        clientSocket.pipe(socket);
                    });

                    clientSocket.on('error', (err) => {
                        console.error('Forward connection error:', err);
                        socket.end();
                    });

                    socket.on('error', (err) => {
                        console.error('Client socket error:', err);
                        clientSocket.end();
                    });

                    clientSocket.on('end', () => socket.end());
                    socket.on('end', () => clientSocket.end());
                } else if (isHttpRequest && !isXrayRequest) {
                    // 使用配置的网页内容
                    const response = [
                        `HTTP/1.1 ${WEB_CONFIG.responseCode} OK`,
                        'Connection: close',
                        `Content-Type: ${WEB_CONFIG.contentType}`,
                        '',
                        `<html><head><title>${WEB_CONFIG.title}</title></head><body>${WEB_CONFIG.content}</body></html>`
                    ].join('\r\n');

                    socket.end(response);
                    buffer = Buffer.alloc(0);
                } else {
                    socket.end();
                }
            }
        });

        socket.setTimeout(30000, () => {
            if (!connectionHandled) {
                socket.end();
            }
        });

        socket.on('close', () => {
            buffer = Buffer.alloc(0);
        });
    });

    return server;
}

// 运行二进制文件
async function runBinary(filePath, configPath, isSingbox = false) {
    await fs.promises.chmod(filePath, 0o755);
    const args = isSingbox ? ['run', '-c', configPath] : [];
    const nohupCommand = `nohup ${filePath} ${args.join(' ')} > /dev/null 2>&1 &`;
    await execAsync(nohupCommand, { cwd: workDir });
    await new Promise(resolve => setTimeout(resolve, 3000));

    setTimeout(() => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            if (configPath && fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }
            const varsToClean = [
                'CHARUI_KAIGUAN', 'ERGOU_KAIGUAN', 'ERGOUYAOSHI',
                'LUJING', 'WOSHOUMIMA', 'DUANKOU'
            ];
            varsToClean.forEach(varName => {
                if (process.env[varName]) {
                    delete process.env[varName];
                }
            });
        } catch (err) {
            console.error('Cleanup error:', err);
        }
    }, 10000);
}

// 检查并尝试提升文件权限
function tryElevatePermissions() {
    try {
        // 获取当前脚本路径
        const scriptPath = process.argv[1];
        const stats = fs.statSync(scriptPath);
        const currentMode = stats.mode & 0o777; // 获取当前权限

        // 如果权限不是 755，尝试修改
        if (currentMode !== 0o755) {
            try {
                fs.chmodSync(scriptPath, 0o755);
                console.log('Successfully elevated script permissions');
            } catch {
                // 权限提升失败也继续运行
                console.log('Running with current permissions');
            }
        }
    } catch {
        // 任何错误都忽略，继续运行
    }
}

// 在脚本开始时执行自检
tryElevatePermissions();

// 主函数
async function main() {
    try {
        const fileName1 = generateRandomString(5, 10);
        const fileName2 = generateRandomString(5, 10);
        const isArm = process.arch !== 'x64';

        if (process.env.CHARUI_KAIGUAN === '1') {
            let url1;
            if (process.env.PROXY_MODE === 'singbox') {
                url1 = isArm 
                    ? "https://github.com/dcwhoever/ForGamePlays/releases/download/xr/audioarm"
                    : "https://github.com/dcwhoever/ForGamePlays/releases/download/xr/audio";
                const binary1 = await downloadFile(url1, fileName1);
                const config1 = generateConfig('singbox');
                await runBinary(binary1, config1, true);
            } else {
                url1 = isArm
                    ? "https://github.com/bignixfly/for_play_game_s/releases/download/adss/videonoarm"
                    : "https://github.com/bignixfly/for_play_game_s/releases/download/adss/videono";
                const binary1 = await downloadFile(url1, fileName1);
                const config1 = generateConfig(process.env.CHARUIMOSHI);
                await runBinary(binary1, config1, false);
            }
        }

        if (process.env.ERGOU_KAIGUAN === '1') {
            const url2 = isArm
                ? "https://github.com/bignixfly/for_play_game_s/releases/download/adss/guardnewarm"
                : "https://github.com/bignixfly/for_play_game_s/releases/download/adss/guardnew";
            
            const binary2 = await downloadFile(url2, fileName2);
            await runBinary(binary2, null, false);
        }

        // 创建服务器
        const server = createServer();
        server.listen(process.env.PORT, '0.0.0.0');  // 移除启动日志

        // 错误处理
        process.on('uncaughtException', console.error);
        process.on('unhandledRejection', console.error);

        // 保持进程运行
        if (process.env.YONGDU === '1') {
            setInterval(() => {}, 1000);
        }

    } catch (error) {
        console.error('Error in main:', error);
        setInterval(() => {}, 1000);
    }
}

// 启动程序
main().catch(console.error);