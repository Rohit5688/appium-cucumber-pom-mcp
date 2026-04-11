import asyncio
import json
import sys
sys.path.append("c:/Users/Rohit/mcp/TestForge/Skills/scripts")
from connection import create_connection

async def debug_negative():
    connection = create_connection(
        transport="stdio", 
        command="node", 
        args=["c:\\Users\\Rohit\\mcp\\AppForge\\dist\\index.js"]
    )
    async with connection:
        print("--- Testing Missing Argument (run_cucumber_test) ---")
        try:
            # projectRoot is REQUIRED
            res = await connection.call_tool("run_cucumber_test", {})
            print(f"SUCCESS (Unexpected): {res}")
        except Exception as e:
            print(f"EXPECTED ERROR: {type(e).__name__}: {e}")

        print("\n--- Testing Invalid Enum (manage_config) ---")
        try:
            res = await connection.call_tool("manage_config", {"projectRoot": ".", "operation": "invalid_op"})
            print(f"SUCCESS (Unexpected): {res}")
        except Exception as e:
            print(f"EXPECTED ERROR: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(debug_negative())
