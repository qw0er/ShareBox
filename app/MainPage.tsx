import Button from "@mui/material/Button";
import { Form } from "react-router";
export default function MainPage() {
	return (
		<Form method="post" encType="multipart/form-data">
			<input type="file" name="file" />
			<Button type="submit" variant="contained" color="primary">
				Upload
			</Button>
		</Form>
	);
}
