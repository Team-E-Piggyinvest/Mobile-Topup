<?php

    if (isset($_POST['recharge'])){

        $phone_number = $_POST['phone_number'];
        $airtime_network = $_POST['airtime_network'];
        $amount = $_POST['amount'];


        $url = 'https://sandbox.wallets.africa/bills/airtime/purchase';
        $data = array(
            // "Code"=> "airtel",
            // "Amount"=> "100",
            // "PhoneNumber"=> "07068260000",
            // "SecretKey"=> "hfucj5jatq8h");

            "Code"=> "$airtime_network",
            "Amount"=> "$amount",
            "PhoneNumber"=> "$phone_number",
            "SecretKey"=> "hfucj5jatq8h");
        
        $postdata = json_encode($data);
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postdata);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
        $result = curl_exec($ch);
        curl_close($ch);
        // print_r($result);
        echo " <script type='text/javascript'> alert('Thanks for your patronage!!!, your number ' + $phone_number + ' was recharged successfully'); </script> ";
    }
?>