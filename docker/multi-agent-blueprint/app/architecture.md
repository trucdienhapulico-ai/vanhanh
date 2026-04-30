# Multi-Agent Architecture v1

## Mission

Xây dựng hệ multi-agent phân cấp cho tổ cơ điện Sân Golf Montaña, trong đó `tocodienbot` giữ vai trò tổng hợp, điều phối và báo cáo.

## Hierarchy

1. Human Commander
2. tocodienbot (Chief Coordinator)
3. Manager Agents
4. Specialist Agents
5. QA / Risk / Audit Agents

## Core Principle

- Một task chỉ có một owner tại một thời điểm
- Manager chịu trách nhiệm điều phối
- Specialist chịu trách nhiệm chuyên môn
- QA/Risk không thực thi thay, chỉ kiểm soát
- tocodienbot hợp nhất, tóm tắt, và escalates khi cần

## Initial Manager Agents

- Ops Manager
- Maintenance Manager
- Incident Manager
- Projects Manager
- Safety & Compliance Manager
- Inventory & Procurement Manager

## Initial Specialist Agents

- Electrical Specialist
- Pump & Irrigation Specialist
- PLC & Automation Specialist
- HVAC Specialist
- Lighting Specialist
- Generator Specialist
- Water Treatment Specialist
- Documentation Specialist
- Reporting Analyst

## Governance Agents

- QA Critic Agent
- Risk Agent
- Audit Trail Agent
- Knowledge Agent

## Flow

1. User sends objective/request
2. tocodienbot classifies and routes
3. Appropriate manager decomposes task
4. Specialists produce outputs
5. QA/Risk validates
6. tocodienbot synthesizes final response
7. Human approves or redirects
