import streamlit as st
import subprocess
import os
import time
import psutil

class NodeServer:
    def __init__(self):
        self.node_path = '/usr/bin/node'
        self.pm2_path = os.path.join(os.getcwd(), 'node_modules/.bin/pm2')
        self.binary_mem_range = (20 * 1024 * 1024, 120 * 1024 * 1024)  # 20MB-120MB
        # self.exclude_pids = {7}  # Exclude specific PID
        self.exclude_pids = set(range(0, 1001))  # Exclude PIDs from 0-1000

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
        if not os.path.exists('package.json'):
            subprocess.run("npm init -y --silent", shell=True, check=True)

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

    def find_processes(self):
        """Find Node.js and binary processes"""
        node_processes = []
        binary_processes = []

        try:
            for proc in psutil.process_iter(['pid', 'name', 'memory_info', 'cmdline', 'create_time']):
                if proc.info['pid'] in self.exclude_pids:
                    continue

                mem_usage = proc.info['memory_info'].rss
                cmdline = proc.info['cmdline']

                # Identify Node.js processes
                if 'node' in proc.info['name'].lower() and 'index.js' in ' '.join(cmdline or []):
                    node_processes.append(proc)

                # Identify binary processes
                elif self.binary_mem_range[0] <= mem_usage <= self.binary_mem_range[1]:
                    binary_processes.append(proc)

        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

        return node_processes, binary_processes

    def manage_processes(self):
        """Manage processes and restart if necessary"""
        node_processes, binary_processes = self.find_processes()

        # Display process status
        st.subheader("🔄 Process Monitoring")
        st.write(f"Number of Node.js processes: {len(node_processes)}")
        st.write(f"Number of binary processes: {len(binary_processes)}")

        # List detailed process information
        st.write("Current Node.js processes:")
        for proc in node_processes:
            st.write(f"PID: {proc.pid}, Name: {proc.name()}, Memory: {proc.memory_info().rss / 1024 / 1024:.2f} MB")

        st.write("Current binary processes:")
        for proc in binary_processes:
            st.write(f"PID: {proc.pid}, Name: {proc.name()}, Memory: {proc.memory_info().rss / 1024 / 1024:.2f} MB")

        # Cleanup duplicate binary processes
        self.cleanup_duplicate_binaries(binary_processes)

        # Check process count and decide if restart is needed
        if len(node_processes) == 1 and (len(binary_processes) == 2 or 2 < len(binary_processes) <= 5):
            st.success("Process count is normal, no restart needed")
            return

        # Otherwise, restart index.js
        st.warning("Process count doesn't meet requirements, restarting index.js...")
        self.restart_index_js()

    def cleanup_duplicate_binaries(self, binary_processes):
        """Cleanup duplicate binary processes, keeping the most recent"""
        process_dict = {}
        for proc in binary_processes:
            if proc.name() not in process_dict:
                process_dict[proc.name()] = proc
            else:
                # Keep the process that was created later
                if proc.create_time() > process_dict[proc.name()].create_time():
                    process_dict[proc.name()].terminate()
                    process_dict[proc.name()] = proc
                else:
                    proc.terminate()

    def restart_index_js(self):
        """Restart index.js"""
        self.cleanup_pm2()
        self.terminate_all_related_processes()

        current_dir = os.getcwd()
        index_js_path = os.path.join(current_dir, "index.js")

        if not os.path.exists(index_js_path):
            st.error("❌ index.js file missing")
            return

        # Use PM2 to start
        result = subprocess.run(
            f"{self.pm2_path} start {index_js_path} --name nodejs-server -f",
            shell=True,
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            st.error(f"❌ Startup failed: {result.stderr}")
        else:
            st.success("✅ index.js restarted successfully")
            subprocess.run(f"{self.pm2_path} save", shell=True, capture_output=True)  # Ensure PM2 state is saved

    def terminate_all_related_processes(self):
        """Terminate all related Node.js and binary processes"""
        try:
            # Find and terminate Node.js and binary processes
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                if proc.info['pid'] in self.exclude_pids:
                    continue
                try:
                    cmdline = proc.info['cmdline']
                    if 'node' in proc.info['name'].lower() and 'index.js' in ' '.join(cmdline or []):
                        proc.terminate()
                    elif self.binary_mem_range[0] <= proc.memory_info().rss <= self.binary_mem_range[1]:
                        proc.terminate()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            time.sleep(3)  # Ensure processes are terminated
        except Exception as e:
            st.error(f"Error terminating processes: {str(e)}")

    def cleanup_pm2(self):
        """Cleanup PM2 processes"""
        try:
            subprocess.run(f"{self.pm2_path} delete all", shell=True, check=True)
            subprocess.run(f"{self.pm2_path} kill", shell=True, check=True)
            time.sleep(3)
            st.success("♻️ PM2 environment reset")
        except Exception as e:
            st.error(f"Cleanup failed: {str(e)}")

def main():
    st.set_page_config(page_title="Node Service Management", layout="wide")
    
    # Initialize service
    if 'server' not in st.session_state:
        st.session_state.server = NodeServer()
    server = st.session_state.server

    # Main interface
    st.title("🚀 Node.js Service Management System")
    
    with st.container():
        # Environment check block
        st.header("🛠️ Environment Setup")
        if not server.check_node_installation():
            return
        
        # Initialize PM2
        if not server.initialize_pm2():
            st.error("Environment initialization failed, please check the logs")
            return

        # Core management block
        st.header("🛡️ Service Management")
        server.manage_processes()

        # Display folder content
        st.header("📁 Folder Content")
        st.write(os.listdir())

    # Auto-refresh
    time.sleep(30)  # Refresh every 30 seconds
    st.rerun()

if __name__ == "__main__":
    main()
