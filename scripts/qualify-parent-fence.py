#!/usr/bin/env python3
"""Non-publishing Linux proof of the bridge parent-death process-group fence."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

WORKER = r'''
import importlib.util,json,os,subprocess,sys,time
spec=importlib.util.spec_from_file_location('bridge',sys.argv[1]); bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)
bridge.install_parent_fence()
child=subprocess.Popen(['/bin/sleep','120'],user=65534,group=65534,extra_groups=[],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
with open(sys.argv[2],'x') as f:
 json.dump({'bridge':os.getpid(),'descendant':child.pid},f);f.flush();os.fsync(f.fileno())
time.sleep(120)
'''
LAUNCHER = r'''
import os,signal,subprocess,sys,time
worker,bridge,marker=sys.argv[1:]
env={'PATH':'/usr/bin:/bin','GOVERNATOR_PARENT_PID':str(os.getpid())}
subprocess.Popen(['/usr/bin/python3','-c',worker,bridge,marker],env=env,start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(200):
 if os.path.isfile(marker): os.kill(os.getpid(),signal.SIGKILL)
 time.sleep(.05)
sys.exit(2)
'''

def alive(pid):
    try:
        # A zombie has exited and cannot continue uploading.
        return Path(f'/proc/{pid}/stat').read_text().rsplit(') ', 1)[1][0] != 'Z'
    except FileNotFoundError:
        return False


def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or len(sys.argv) != 2 or not os.path.isabs(sys.argv[1]):
        raise RuntimeError('Linux root fixture and absolute bridge path required')
    with tempfile.TemporaryDirectory(prefix='governator-parent-fence-') as tmp:
        marker = str(Path(tmp) / 'processes.json')
        launcher = subprocess.run(['/usr/bin/python3', '-c', LAUNCHER, WORKER, sys.argv[1], marker], env={'PATH':'/usr/bin:/bin'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        if launcher.returncode != -signal.SIGKILL: raise RuntimeError('fixture parent did not terminate as expected')
        data = json.loads(Path(marker).read_text())
        bridge, descendant = data['bridge'], data['descendant']
        try:
            for _ in range(100):
                if not alive(bridge) and not alive(descendant):
                    print(json.dumps({'mode':'linux-parent-death-fixture','publishable':False,'parent':'SIGKILL','bridgeTerminated':True,'descendantTerminated':True}))
                    return
                time.sleep(.05)
            raise RuntimeError('bridge or descendant survived parent death')
        finally:
            try: os.killpg(bridge, signal.SIGKILL)
            except ProcessLookupError: pass

if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        print('parent fence fixture failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
