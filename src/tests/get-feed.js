import http from 'k6/http';
import { check, group } from 'k6';

export const options = {
  vus: 10,
  duration: '10s',
  thresholds: {
    'http_req_duration{name:GetFeed}': ['p(95)<800'],
    'http_req_failed{name:GetFeed}': ['rate<0.02'],
  },
};

const email = 'testuser@example.com'; 
const password = 'password123';

export default function () {
  group('Get Feed', () => {
    const loginRes = http.post('http://localhost:8000/auth/login', JSON.stringify({ email, password }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Login' },
    });

    const loginCheck = check(loginRes, { 'Login: status is 200': (r) => r.status === 200 });
    if (!loginCheck) {
      return;
    }

    const token = JSON.parse(loginRes.body).token;

    const feedRes = http.get('http://localhost:8000/feed', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      tags: { name: 'GetFeed' },
    });

    check(feedRes, { 'Get Feed: status is 200': (r) => r.status === 200 });
    check(feedRes, { 'Get Feed: response time is acceptable': (r) => r.timings.duration < 800 });
  });
}
