package prototype1;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.Scanner;


class Prototype1
{
    public static void main(String args[])
    {
        int count=1;
        String choice="Y";
        LinkedList<String> list = new LinkedList();
        Scanner sc = new Scanner(System.in);

        while(choice != "N" || choice != "n")
        {
            System.out.println("Enter your task "+count++);
            String task1 = sc.nextLine();
            list.add(task1);

            System.out.println("Wanna enter another task ? press (Y/N)");
            choice = sc.nextLine();
        }
    }
}