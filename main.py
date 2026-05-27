from collections import defaultdict
from typing import List


# ─────────────────────────────────────────────
# 1. 3Sum (Medium)
# Given an integer array nums, return all triplets [nums[i], nums[j], nums[k]]
# such that i != j != k and nums[i] + nums[j] + nums[k] == 0.
# No duplicate triplets in the result.
# ─────────────────────────────────────────────
def three_sum(nums: List[int]) -> List[List[int]]:
    pass


# ─────────────────────────────────────────────
# 2. Word Search (Medium)
# Given an m x n grid of characters and a string word,
# return True if the word exists in the grid (horizontal/vertical, no reuse).
# ─────────────────────────────────────────────
def exist(board: List[List[str]], word: str) -> bool:
    pass


# ─────────────────────────────────────────────
# 3. Is Subsequence (Easy)
# Given strings s and t, return True if s is a subsequence of t.
# ─────────────────────────────────────────────
def is_subsequence(s: str, t: str) -> bool:
    pass


# ─────────────────────────────────────────────
# 4. Group Anagrams (Medium)
# Given a list of strings, group anagrams together.
# ─────────────────────────────────────────────
def group_anagrams(strs: List[str]) -> List[List[str]]:
    pass


# ─────────────────────────────────────────────
# 5. Remove Duplicates from Sorted Array II (Medium)
# Given a sorted array, allow each element at most twice in-place.
# Return the new length k; first k elements must be in correct order.
# ─────────────────────────────────────────────
def remove_duplicates(nums: List[int]) -> int:
    pass


# ─────────────────────────────────────────────
# 6. Find Duplicates in Custom Objects (Veeva-style)
# Given a list of Person objects, return groups of duplicates
# where a duplicate is defined as same email OR (same name + same dob).
# ─────────────────────────────────────────────
class Person:
    def __init__(self, first_name: str, last_name: str, email: str, dob: str):
        self.first_name = first_name
        self.last_name = last_name
        self.email = email
        self.dob = dob  # "YYYY-MM-DD"

    def __repr__(self):
        return f"Person({self.first_name} {self.last_name}, {self.email}, {self.dob})"


def find_duplicate_persons(people: List[Person]) -> List[List[Person]]:
    pass


# ─────────────────────────────────────────────
# Tests — fill these in as you solve each problem
# ─────────────────────────────────────────────
if __name__ == "__main__":
    # 1. 3Sum
    print(three_sum([-1, 0, 1, 2, -1, -4]))   # [[-1,-1,2],[-1,0,1]]

    # 2. Word Search
    board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]]
    print(exist(board, "ABCCED"))  # True
    print(exist(board, "SEE"))     # True
    print(exist(board, "ABCB"))    # False

    # 3. Is Subsequence
    print(is_subsequence("ace", "abcde"))  # True
    print(is_subsequence("aec", "abcde"))  # False

    # 4. Group Anagrams
    print(group_anagrams(["eat","tea","tan","ate","nat","bat"]))

    # 5. Remove Duplicates II
    nums = [1,1,1,2,2,3]
    k = remove_duplicates(nums)
    print(nums[:k])  # [1,1,2,2,3]

    # 6. Find Duplicate Persons
    people = [
        Person("John", "Doe", "john@example.com", "1990-01-01"),
        Person("John", "Doe", "other@example.com", "1990-01-01"),  # same name+dob
        Person("Jane", "Smith", "jane@example.com", "1985-05-10"),
        Person("Alice", "Wu", "john@example.com", "2000-03-03"),   # same email as first
    ]
    print(find_duplicate_persons(people))
