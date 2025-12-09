const scenarioContainer = document.getElementById('scenario-buttons');
const statusDiv = document.getElementById('status');
// 监听主进程发送的场景列表更新
window.electronAPI.onUpdateScenarios((scenarioNames) => {
    console.log('Received scenarios:', scenarioNames);
    scenarioContainer.innerHTML = ''; // 清空旧按钮
    if (scenarioNames && scenarioNames.length > 0) {
        scenarioNames.forEach(name => {
            const button = document.createElement('button');
            button.textContent = `Run: ${name}`;
            button.addEventListener('click', async () => {
                statusDiv.textContent = `Running scenario: ${name}...`;
                try {
                    const result = await window.electronAPI.runScenario(name);
                    console.log('Scenario result:', result);
                    // 使用 pre 标签保留换行符
                    statusDiv.innerHTML = `Scenario '${name}' finished.<br><pre>${result.message.replace(/\n/g, '<br>')}</pre>`;
                }
                catch (error) {
                    console.error('Error running scenario:', error);
                    statusDiv.textContent = `Error running scenario '${name}': ${error.message}`;
                }
            });
            scenarioContainer.appendChild(button);
        });
    }
    else {
        scenarioContainer.textContent = 'No scenarios loaded. Check scenarios.json or console logs.';
    }
});



// --- 新增：专注秒表控制按钮 ---
// 1. 创建一个按钮元素
const stopwatchBtn = document.createElement('button');
stopwatchBtn.textContent = "⏱️ 开启专注秒表";

// 简单的样式美化（可选，你可以根据需要调整）
stopwatchBtn.style.marginTop = "20px";
stopwatchBtn.style.padding = "10px 20px";
stopwatchBtn.style.fontSize = "16px";
stopwatchBtn.style.cursor = "pointer";
stopwatchBtn.style.backgroundColor = "#2c3e50"; // 深色背景
stopwatchBtn.style.color = "white";
stopwatchBtn.style.border = "none";
stopwatchBtn.style.borderRadius = "5px";

// 2. 添加点击事件：点击时通知主进程打开秒表窗口
stopwatchBtn.addEventListener('click', () => {
    // 调用我们在 preload.js 里暴露的接口
    window.electronAPI.action('stopwatch_open_widget');
});

// 3. 把按钮添加到页面上 (添加到 body 的末尾，或者你可以指定添加到 scenario-buttons 容器里)
document.body.appendChild(stopwatchBtn);


console.log('Renderer script loaded.');
