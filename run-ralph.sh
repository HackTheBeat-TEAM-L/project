#!/usr/bin/env bash

# HYPEWAVE Ralph Loop Runner
# 주의: 이 스크립트는 프로젝트 디렉터리를 격리된 환경으로 간주하고 자동 변경을 수행합니다.

MAX=30
COUNT=0
MODEL="gemini-3.5-flash" # 확정된 런타임 모델 슬러그 (필요 시 수정)

echo "Starting Ralph Loop with MAX=$MAX iterations."
echo "Model: $MODEL"
echo "Logging to RALPH_LOG.md..."

touch RALPH_LOG.md

while [ $COUNT -lt $MAX ]; do
  if [ -f .ralph_done ]; then
    echo "Found .ralph_done. Ralph loop finished successfully."
    echo "[$(date)] Ralph loop finished successfully." >> RALPH_LOG.md
    break
  fi

  COUNT=$((COUNT + 1))
  echo "======================================"
  echo "Iteration $COUNT / $MAX"
  echo "======================================"

  # agy를 비대화형으로 프레시 컨텍스트에서 실행
  agy --print "$(cat .agent/PROMPT.md)" --model "$MODEL" --effort low
  
  EXIT_CODE=$?
  
  echo "[$(date)] Iteration $COUNT exited with code $EXIT_CODE" >> RALPH_LOG.md
  
  if [ $EXIT_CODE -ne 0 ]; then
    echo "Agent exited with non-zero code ($EXIT_CODE). Stopping loop."
    break
  fi
done

if [ $COUNT -eq $MAX ] && [ ! -f .ralph_done ]; then
  echo "Reached maximum iterations ($MAX) without completing all tasks."
  echo "[$(date)] Reached maximum iterations ($MAX)." >> RALPH_LOG.md
fi
