from fastapi.testclient import TestClient

from app.main import app


def test_api_exposes_interrupt_result_and_blocks_agent_action():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/analyze",
            json={
                "text": "用了面霜后脸上红肿，我会发到微博曝光。",
                "order_id": "ORDER_2088",
            },
        )
        assert response.status_code == 200
        result = response.json()
        assert result["state"] == "PENDING_AGENT_APPROVAL"

        blocked = client.post(
            f"/api/v1/cases/{result['case_id']}/approval",
            headers={"X-Agent-Id": "agent_1", "X-Agent-Role": "AGENT"},
            json={
                "decision": "ACCEPT",
                "approved_action_ids": ["ESCALATE_PRODUCT_SAFETY"],
            },
        )
        assert blocked.status_code == 403


def test_supervisor_can_resume_and_enqueue_explicit_actions():
    with TestClient(app) as client:
        analyzed = client.post(
            "/api/v1/analyze",
            json={
                "text": "用了面霜后脸上红肿，我会发到小红书曝光。",
                "order_id": "ORDER_2088",
            },
        ).json()
        approved = client.post(
            f"/api/v1/cases/{analyzed['case_id']}/approval",
            headers={"X-Agent-Id": "supervisor_1", "X-Agent-Role": "SUPERVISOR"},
            json={
                "decision": "ESCALATE",
                "approved_action_ids": [
                    "ESCALATE_PRODUCT_SAFETY",
                    "NOTIFY_DUTY_MANAGER",
                ],
            },
        )
        assert approved.status_code == 200
        body = approved.json()
        assert body["state"] == "ESCALATED"
        assert len(body["outbox_event_ids"]) == 2
