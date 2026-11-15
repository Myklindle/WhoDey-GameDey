import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import update_press as u

class PickTest(unittest.TestCase):
    def test_pick(self):
        found = [
            ("a", "2026 Week 10 Cincinnati Bengals vs Pittsburgh Steelers | Bengals Weekly"),
            ("b", "Zac Taylor Press Conference - November 8"),
            ("c", "Cincinnati Bengals Highlights vs. Tennessee Titans | Week 8"),
            ("b", "Zac Taylor Press Conference - November 8"),
            ("d", "Cincinnati Bengals Highlights vs. Baltimore Ravens | Week 7"),
            ("e", "Joe Burrow Press Conference - November 8"),
        ]
        out = u.pick(found)
        self.assertEqual([i["videoId"] for i in out], ["c", "b", "e"])
        self.assertEqual(out[0]["kind"], "highlights")

if __name__ == "__main__":
    unittest.main()
