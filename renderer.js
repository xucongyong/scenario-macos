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
        } catch (error) {
          console.error('Error running scenario:', error);
          statusDiv.textContent = `Error running scenario '${name}': ${error.message}`;
        }
      });
      scenarioContainer.appendChild(button);
    });
  } else {
    scenarioContainer.textContent = 'No scenarios loaded. Check scenarios.json or console logs.';
  }
});

console.log('Renderer script loaded.');