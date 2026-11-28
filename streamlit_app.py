import streamlit as st
import subprocess
import os
import time
import psutil
class NodeServer:
    def __init__(self):
        self.node_path = '/usr/bin/node'
        self.pm2_path = os.path.join(os.getcwd(), 'node_modules/.bin/pm2')
        self.binary_mem_range = (20 * 1024 * 1024, 120 * 1024 * 1024)
        self.exclude_pids = set(range(0, 1001))
    def check_node_installation(self):
        """Check Node.js installation"""
        try:
            result = subprocess.run(
                "command -v node",
                shell=True,
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                self.node_path = result.stdout.strip()
                version_result = subprocess.run(
                    f"{self.node_path} --version",
                    shell=True,
                    capture_output=True,
                    text=True
                )
                if version_result.returncode == 0:
                    st.success(f"✔ Node.js {version_result.stdout.strip()}")
                    return True
            st.error("❌ Node.js not found")
            return False
        except Exception as e:
            st.error(f"Node check error: {str(e)}")
            return False
    def initialize_pm2(self):
        """Initialize PM2 environment"""
        try:
            if not os.path.exists('package.json'):
                subprocess.run("npm init -y --silent", shell=True, capture_output=True)
            if not os.path.exists('node_modules/pm2'):
                with st.spinner("Installing PM2..."):
                    result = subprocess.run(
                        "npm install pm2@5.2.2 --save --silent",
                        shell=True,
                        capture_output=True,
                        text=True
                    )
                    if result.returncode != 0:
                        st.error(f"PM2 installation failed: {result.stderr}")
                        return False
                    st.success("✅ PM2 installation completed")
            return True
        except Exception as e:
            st.error(f"PM2 initialization error: {str(e)}")
            return False
    def find_processes(self):
        """Find Node.js and binary processes"""
        node_processes = []
        binary_processes = []
        try:
            for proc in psutil.process_iter(['pid', 'name', 'memory_info', 'cmdline', 'create_time']):
                try:
                    if proc.info['pid'] in self.exclude_pids:
                        continue
                    mem_usage = proc.info['memory_info'].rss
                    cmdline = proc.info['cmdline'] or []
                    if 'node' in proc.info['name'].lower() and 'index.js' in ' '.join(cmdline):
                        node_processes.append(proc)
                    elif self.binary_mem_range[0] <= mem_usage <= self.binary_mem_range[1]:
                        binary_processes.append(proc)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            st.warning(f"Process scanning error: {str(e)}")
        return node_processes, binary_processes
    def manage_processes(self):
        """Manage processes and restart if necessary"""
        try:
            node_processes, binary_processes = self.find_processes()
            st.subheader("🔄 Process Monitoring")
            st.write(f"Number of Node.js processes: {len(node_processes)}")
            st.write(f"Number of binary processes: {len(binary_processes)}")
            if node_processes:
                st.write("Current Node.js processes:")
                for proc in node_processes:
                    try:
                        st.write(f"PID: {proc.pid}, Name: {proc.name()}, Memory: {proc.memory_info().rss / 1024 / 1024:.2f} MB")
                    except:
                        pass
            if binary_processes:
                st.write("Current binary processes:")
                for proc in binary_processes:
                    try:
                        st.write(f"PID: {proc.pid}, Name: {proc.name()}, Memory: {proc.memory_info().rss / 1024 / 1024:.2f} MB")
                    except:
                        pass
            self.cleanup_duplicate_binaries(binary_processes)
            if len(node_processes) == 1 and (len(binary_processes) == 2 or 2 < len(binary_processes) <= 5):
                st.success("✅ Process count is normal")
                return
            st.warning("⚠️ Process count doesn't meet requirements, restarting index.js...")
            self.restart_index_js()
            
        except Exception as e:
            st.error(f"Process management error: {str(e)}")
    def cleanup_duplicate_binaries(self, binary_processes):
        """Cleanup duplicate binary processes"""
        try:
            process_dict = {}
            for proc in binary_processes:
                try:
                    if proc.name() not in process_dict:
                        process_dict[proc.name()] = proc
                    else:
                        if proc.create_time() > process_dict[proc.name()].create_time():
                            process_dict[proc.name()].terminate()
                            process_dict[proc.name()] = proc
                        else:
                            proc.terminate()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            st.warning(f"Binary cleanup error: {str(e)}")
    def restart_index_js(self):
        """Restart index.js"""
        try:
            current_dir = os.getcwd()
            index_js_path = os.path.join(current_dir, "index.js")
            if not os.path.exists(index_js_path):
                st.error("❌ index.js file missing")
                return
            # ✅ 先尝试重启
            restart_result = subprocess.run(
                f"{self.pm2_path} restart nodejs-server",
                shell=True,
                capture_output=True,
                text=True
            )
            
            if restart_result.returncode != 0:
                # ✅ 如果没有进程，删除后启动
                subprocess.run(
                    f"{self.pm2_path} delete nodejs-server", 
                    shell=True, 
                    capture_output=True,
                    text=True
                )
                time.sleep(1)
                
                start_result = subprocess.run(
                    f"{self.pm2_path} start {index_js_path} --name nodejs-server",
                    shell=True,
                    capture_output=True,
                    text=True
                )
                
                if start_result.returncode != 0:
                    st.error(f"❌ Startup failed: {start_result.stderr}")
                    return
            
            st.success("✅ index.js is running")
            subprocess.run(f"{self.pm2_path} save --force", shell=True, capture_output=True)
                
        except Exception as e:
            st.error(f"Restart error: {str(e)}")
    def terminate_all_related_processes(self):
        """Terminate related processes (not used in new version)"""
        pass
    def cleanup_pm2(self):
        """Not used - kept for compatibility"""
        pass
def main():
    st.set_page_config(page_title="Node Service Management", layout="wide")
    
    if 'server' not in st.session_state:
        st.session_state.server = NodeServer()
    server = st.session_state.server
    st.title("🚀 Node.js Service Management System")
    
    try:
        with st.container():
            st.header("🛠️ Environment Setup")
            if not server.check_node_installation():
                st.stop()
            
            if not server.initialize_pm2():
                st.error("Environment initialization failed")
                st.stop()
            st.header("🛡️ Service Management")
            server.manage_processes()
            st.header("📁 Folder Content")
            st.write(os.listdir())
        st.sidebar.info(f"Last check: {time.strftime('%H:%M:%S')}")
        
        if st.sidebar.button("🔄 Refresh"):
            st.rerun()
            
    except Exception as e:
        st.error(f"Error: {str(e)}")
        st.stop()
    time.sleep(3)  # ✅ 稍微延长一点，给进程启动时间
    st.rerun()
if __name__ == "__main__":
    main()
